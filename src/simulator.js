/**
 * WS斩杀模拟器 - 核心逻辑
 */

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  next() {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  
  shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

class Deck {
  // totalCards/climaxCount: 总牌库（洗牌后）
  // initialCards/initialClimax: 初始牌库（可选，默认等于总牌库）
  constructor(totalCards, climaxCount, rng, initialCards = null, initialClimax = null) {
    this.rng = rng;
    this.graveyard = [];
    this.resolution = [];
    this.gameOver = false;
    this.refreshPenalty = 0; // 累计洗牌罚血
    this.refreshEvents = []; // 记录洗牌事件
    this.virtualMeat = 0; // 虚拟肉计数（反洗加入的肉，打掉后不进坟场）
    
    // 如果指定了初始牌库，则分配初始牌库和墓地
    if (initialCards !== null && initialClimax !== null) {
      // 初始牌库
      this.cards = [];
      for (let i = 0; i < initialClimax; i++) this.cards.push(1);
      for (let i = 0; i < initialCards - initialClimax; i++) this.cards.push(0);
      this.cards = this.rng.shuffle(this.cards);
      
      // 墓地：总牌库减去初始牌库
      const graveyardClimax = climaxCount - initialClimax;
      const graveyardTotal = totalCards - initialCards;
      for (let i = 0; i < graveyardClimax; i++) this.graveyard.push(1);
      for (let i = 0; i < graveyardTotal - graveyardClimax; i++) this.graveyard.push(0);
      this.graveyard = this.rng.shuffle(this.graveyard);
    } else {
      // 默认：全部在牌库
      this.cards = [];
      for (let i = 0; i < climaxCount; i++) this.cards.push(1);
      for (let i = 0; i < totalCards - climaxCount; i++) this.cards.push(0);
      this.cards = this.rng.shuffle(this.cards);
    }
  }
  
  // 洗牌：墓地洗回牌库，罚1血
  refresh() {
    if (this.graveyard.length === 0) {
      this.gameOver = true;
      return false;
    }
    this.cards = this.rng.shuffle([...this.graveyard]);
    this.graveyard = [];
    this.refreshPenalty++;
    this.refreshEvents.push([...this.cards]); // 记录洗牌后牌库
    return true;
  }
  
  // 抽顶，牌库空时自动洗牌
  drawTop() {
    if (this.cards.length === 0) {
      if (!this.refresh()) return null;
    }
    return this.cards.shift();
  }
  
  // 抽底，牌库空时自动洗牌
  drawBottom() {
    if (this.cards.length === 0) {
      if (!this.refresh()) return null;
    }
    return this.cards.pop();
  }
  
  removeTop(n) {
    const result = [];
    for (let i = 0; i < n; i++) {
      if (this.cards.length === 0) {
        if (!this.refresh()) break;
      }
      if (this.cards.length > 0) {
        result.push(this.cards.shift());
      }
    }
    return result;
  }
  
  putOnTop(cards) {
    this.cards = cards.concat(this.cards);
  }
  
  resolveToGraveyard() {
    // 把resolution里的牌放入墓地，处理虚拟肉
    for (const card of this.resolution) {
      if (card === 0 && this.virtualMeat > 0) {
        this.virtualMeat--;
      } else {
        this.graveyard.push(card);
      }
    }
    this.resolution = [];
    this.checkRefresh();
  }
  
  // 检查牌库是否空，如果空就立即洗牌
  checkRefresh() {
    if (this.cards.length === 0 && this.graveyard.length > 0) {
      this.refresh();
    }
  }
  
  // 往墓地放牌（并检查是否需要洗牌）
  toGraveyard(card) {
    // 如果是肉且有虚拟肉，则虚拟肉--，不加入坟场
    if (card === 0 && this.virtualMeat > 0) {
      this.virtualMeat--;
    } else {
      this.graveyard.push(card);
    }
    this.checkRefresh();
  }
  
  // 往墓地放多张牌
  toGraveyardMultiple(cards) {
    for (const card of cards) {
      if (card === 0 && this.virtualMeat > 0) {
        this.virtualMeat--;
      } else {
        this.graveyard.push(card);
      }
    }
    this.checkRefresh();
  }
  
  size() {
    return this.cards.length;
  }
  
  // 获取并重置罚血和洗牌事件
  getAndResetPenalty() {
    const p = this.refreshPenalty;
    this.refreshPenalty = 0;
    return p;
  }
  
  getAndResetRefreshEvents() {
    const events = this.refreshEvents;
    this.refreshEvents = [];
    return events;
  }
}

const Actions = {
  hit: (deck, amount) => {
    if (deck.gameOver) {
      return { damage: 0, cancelled: false, penalty: 0, flipped: [], flipSegments: [] };
    }
    
    deck.resolution = [];
    const flipped = [];
    const flipSegments = [];
    let currentSegment = [];
    
    for (let i = 0; i < amount; i++) {
      const card = deck.drawTop();
      if (card === null) {
        // 真的没牌了（墓地也空）
        if (currentSegment.length > 0) {
          flipSegments.push({ cards: [...currentSegment] });
        }
        deck.resolveToGraveyard();
        const penalty = deck.getAndResetPenalty();
        return { damage: 0, cancelled: false, penalty, flipped, flipSegments };
      }
      
      deck.resolution.push(card);
      flipped.push(card);
      currentSegment.push(card);
      
      // 抽完这张牌后，牌库空了就立即洗牌
      if (deck.cards.length === 0 && deck.graveyard.length > 0) {
        // 保存当前段
        flipSegments.push({ cards: [...currentSegment] });
        currentSegment = [];
        deck.refresh();
        flipSegments.push({ refresh: true, newDeck: [...deck.cards] });
      }
      
      if (card === 1) {
        if (currentSegment.length > 0) {
          flipSegments.push({ cards: [...currentSegment] });
        }
        deck.resolveToGraveyard();
        const penalty = deck.getAndResetPenalty();
        return { damage: 0, cancelled: true, penalty, flipped, flipSegments };
      }
    }
    
    if (currentSegment.length > 0) {
      flipSegments.push({ cards: [...currentSegment] });
    }
    deck.resolveToGraveyard();
    const penalty = deck.getAndResetPenalty();
    return { damage: amount, cancelled: false, penalty, flipped, flipSegments };
  },
  
  lookTopDiscardClimax: (deck, n) => {
    if (deck.gameOver || deck.size() === 0) {
      return { discardedClimax: 0, looked: [], penalty: 0 };
    }
    
    const cards = deck.removeTop(n);
    let discarded = 0;
    const kept = [];
    
    for (const card of cards) {
      if (card === 1) {
        deck.graveyard.push(card);
        discarded++;
      } else {
        kept.push(card);
      }
    }
    
    deck.putOnTop(kept);
    deck.checkRefresh();
    const penalty = deck.getAndResetPenalty();
    return { discardedClimax: discarded, looked: cards, penalty };
  },
  
  // 对手反摩卡：看顶X张，丢掉肉（留下潮）
  lookTopDiscardMeat: (deck, n) => {
    if (deck.gameOver || deck.size() === 0) {
      return { discardedMeat: 0, looked: [], penalty: 0 };
    }
    
    const cards = deck.removeTop(n);
    let discarded = 0;
    const kept = [];
    
    for (const card of cards) {
      if (card === 0) {
        // 丢掉肉（非潮）
        if (deck.virtualMeat > 0) {
          deck.virtualMeat--;
        } else {
          deck.graveyard.push(card);
        }
        discarded++;
      } else {
        // 保留潮
        kept.push(card);
      }
    }
    
    deck.putOnTop(kept);
    deck.checkRefresh();
    const penalty = deck.getAndResetPenalty();
    return { discardedMeat: discarded, looked: cards, penalty };
  },
  
  // 反洗：往牌库加X张虚拟肉，然后洗牌（不罚血）
  antiRefresh: (deck, n) => {
    if (deck.gameOver) {
      return { addedMeat: 0, penalty: 0, newDeck: [] };
    }
    
    // 加入X张虚拟肉到牌库
    for (let i = 0; i < n; i++) {
      deck.cards.push(0);
    }
    deck.virtualMeat += n;
    
    // 洗牌（不罚血）
    deck.cards = deck.rng.shuffle(deck.cards);
    
    return { addedMeat: n, penalty: 0, newDeck: [...deck.cards] };
  },
  
  flipBottom: (deck, n) => {
    if (deck.gameOver) {
      return { climaxCount: 0, penalty: 0, flipped: [] };
    }
    
    let climaxCount = 0;
    const flipped = [];
    
    for (let i = 0; i < n; i++) {
      // 牌库空时洗牌
      if (deck.cards.length === 0) {
        if (deck.graveyard.length === 0) {
          deck.gameOver = true;
          break;
        }
        deck.cards = deck.rng.shuffle([...deck.graveyard]);
        deck.graveyard = [];
        deck.refreshPenalty++;
        deck.refreshEvents.push([...deck.cards]);
      }
      
      const card = deck.cards.pop();
      flipped.push(card);
      // 处理虚拟肉
      if (card === 0 && deck.virtualMeat > 0) {
        deck.virtualMeat--;
      } else {
        deck.graveyard.push(card);
      }
      if (card === 1) {
        climaxCount++;
      }
    }
    
    deck.checkRefresh();
    const penalty = deck.getAndResetPenalty();
    return { climaxCount, penalty, flipped };
  },

  // 堆顶：往牌库顶放"虚拟"非潮卡（肉）
  putTop: (deck, n) => {
    if (deck.gameOver) return { placed: 0 };
    // 简化处理：直接在牌库顶部添加n张非潮卡
    for (let i = 0; i < n; i++) {
      deck.cards.unshift(0);
    }
    return { placed: n };
  },

  // 翻底打X：翻底n张，伤害=翻到的潮数
  flipHitClimax: (deck, n) => {
    if (deck.gameOver) return { damage: 0, cancelled: false, penalty: 0, flipped: [], flippedBottom: [], flipSegments: [] };
    
    let climaxCount = 0;
    const flippedBottom = [];
    const flipSegments = []; // 记录翻牌分段和洗牌事件
    let currentSegment = [];
    
    for (let i = 0; i < n; i++) {
      // 牌库空时洗牌
      if (deck.cards.length === 0) {
        if (deck.graveyard.length === 0) {
          deck.gameOver = true;
          break;
        }
        // 保存当前段
        if (currentSegment.length > 0) {
          flipSegments.push({ cards: [...currentSegment] });
          currentSegment = [];
        }
        deck.cards = deck.rng.shuffle([...deck.graveyard]);
        deck.graveyard = [];
        deck.refreshPenalty++;
        // 记录洗牌事件
        flipSegments.push({ refresh: true, newDeck: [...deck.cards] });
      }
      
      const card = deck.cards.pop();
      flippedBottom.push(card);
      currentSegment.push(card);
      // 处理虚拟肉
      if (card === 0 && deck.virtualMeat > 0) {
        deck.virtualMeat--;
      } else {
        deck.graveyard.push(card);
      }
      if (card === 1) climaxCount++;
    }
    
    // 保存最后一段
    if (currentSegment.length > 0) {
      flipSegments.push({ cards: [...currentSegment] });
    }
    
    if (climaxCount === 0) {
      deck.checkRefresh();
      const penalty = deck.getAndResetPenalty();
      return { damage: 0, cancelled: false, penalty, flipped: [], flippedBottom, flipSegments, climaxCount: 0 };
    }
    
    const hitResult = Actions.hit(deck, climaxCount);
    return { ...hitResult, flippedBottom, flipSegments, climaxCount };
  },

  // 翻底打1：翻底n张，有潮就打1
  flipHitOne: (deck, n) => {
    if (deck.gameOver) return { damage: 0, cancelled: false, penalty: 0, flipped: [], flippedBottom: [], flipSegments: [] };
    
    let hasClimax = false;
    const flippedBottom = [];
    const flipSegments = [];
    let currentSegment = [];
    
    for (let i = 0; i < n; i++) {
      // 牌库空时洗牌
      if (deck.cards.length === 0) {
        if (deck.graveyard.length === 0) {
          deck.gameOver = true;
          break;
        }
        if (currentSegment.length > 0) {
          flipSegments.push({ cards: [...currentSegment] });
          currentSegment = [];
        }
        deck.cards = deck.rng.shuffle([...deck.graveyard]);
        deck.graveyard = [];
        deck.refreshPenalty++;
        flipSegments.push({ refresh: true, newDeck: [...deck.cards] });
      }
      
      const card = deck.cards.pop();
      flippedBottom.push(card);
      currentSegment.push(card);
      // 处理虚拟肉
      if (card === 0 && deck.virtualMeat > 0) {
        deck.virtualMeat--;
      } else {
        deck.graveyard.push(card);
      }
      if (card === 1) hasClimax = true;
    }
    
    if (currentSegment.length > 0) {
      flipSegments.push({ cards: [...currentSegment] });
    }
    
    if (!hasClimax) {
      deck.checkRefresh();
      const penalty = deck.getAndResetPenalty();
      return { damage: 0, cancelled: false, penalty, flipped: [], flippedBottom, flipSegments };
    }
    
    const hitResult = Actions.hit(deck, 1);
    return { ...hitResult, flippedBottom, flipSegments };
  },

  // 翻底打2：翻底n张，有潮就打2
  flipHitTwo: (deck, n) => {
    if (deck.gameOver) return { damage: 0, cancelled: false, penalty: 0, flipped: [], flippedBottom: [], flipSegments: [] };
    
    let hasClimax = false;
    const flippedBottom = [];
    const flipSegments = [];
    let currentSegment = [];
    
    for (let i = 0; i < n; i++) {
      if (deck.cards.length === 0) {
        if (deck.graveyard.length === 0) {
          deck.gameOver = true;
          break;
        }
        if (currentSegment.length > 0) {
          flipSegments.push({ cards: [...currentSegment] });
          currentSegment = [];
        }
        deck.cards = deck.rng.shuffle([...deck.graveyard]);
        deck.graveyard = [];
        deck.refreshPenalty++;
        flipSegments.push({ refresh: true, newDeck: [...deck.cards] });
      }
      
      const card = deck.cards.pop();
      flippedBottom.push(card);
      currentSegment.push(card);
      // 处理虚拟肉
      if (card === 0 && deck.virtualMeat > 0) {
        deck.virtualMeat--;
      } else {
        deck.graveyard.push(card);
      }
      if (card === 1) hasClimax = true;
    }
    
    if (currentSegment.length > 0) {
      flipSegments.push({ cards: [...currentSegment] });
    }
    
    if (!hasClimax) {
      deck.checkRefresh();
      const penalty = deck.getAndResetPenalty();
      return { damage: 0, cancelled: false, penalty, flipped: [], flippedBottom, flipSegments };
    }
    
    const hitResult = Actions.hit(deck, 2);
    return { ...hitResult, flippedBottom, flipSegments };
  },

  // 翻底打X个1：翻底n张，翻到几个潮就打几次1（每次独立判定）
  flipHitXOnes: (deck, n) => {
    if (deck.gameOver) return { damage: 0, cancelled: false, penalty: 0, flipped: [], flippedBottom: [], flipSegments: [], hitResults: [] };
    
    let climaxCount = 0;
    const flippedBottom = [];
    const flipSegments = [];
    let currentSegment = [];
    
    for (let i = 0; i < n; i++) {
      if (deck.cards.length === 0) {
        if (deck.graveyard.length === 0) {
          deck.gameOver = true;
          break;
        }
        if (currentSegment.length > 0) {
          flipSegments.push({ cards: [...currentSegment] });
          currentSegment = [];
        }
        deck.cards = deck.rng.shuffle([...deck.graveyard]);
        deck.graveyard = [];
        deck.refreshPenalty++;
        flipSegments.push({ refresh: true, newDeck: [...deck.cards] });
      }
      
      const card = deck.cards.pop();
      flippedBottom.push(card);
      currentSegment.push(card);
      // 处理虚拟肉
      if (card === 0 && deck.virtualMeat > 0) {
        deck.virtualMeat--;
      } else {
        deck.graveyard.push(card);
      }
      if (card === 1) climaxCount++;
    }
    
    if (currentSegment.length > 0) {
      flipSegments.push({ cards: [...currentSegment] });
    }
    
    if (climaxCount === 0) {
      deck.checkRefresh();
      const penalty = deck.getAndResetPenalty();
      return { damage: 0, cancelled: false, penalty, flipped: [], flippedBottom, flipSegments, hitResults: [], climaxCount: 0 };
    }
    
    // 打X个1，每次独立判定
    const hitResults = [];
    let totalDamage = 0;
    let totalPenalty = 0;
    const allFlipped = [];
    
    for (let i = 0; i < climaxCount; i++) {
      if (deck.gameOver) break;
      const hitResult = Actions.hit(deck, 1);
      hitResults.push(hitResult);
      if (hitResult.damage) totalDamage += hitResult.damage;
      if (hitResult.penalty) totalPenalty += hitResult.penalty;
      if (hitResult.flipped) allFlipped.push(...hitResult.flipped);
    }
    
    return { 
      damage: totalDamage, 
      cancelled: hitResults.length > 0 && hitResults[hitResults.length - 1].cancelled,
      penalty: totalPenalty, 
      flipped: allFlipped, 
      flippedBottom, 
      flipSegments, 
      hitResults,
      climaxCount
    };
  },

  // 真伤：翻牌但伤害直接生效（不会被cancel）
  trueDamage: (deck, amount) => {
    if (deck.gameOver) {
      return { damage: 0, cancelled: false, penalty: 0, flipped: [], flipSegments: [] };
    }
    
    const flipped = [];
    const flipSegments = [];
    let currentSegment = [];
    
    for (let i = 0; i < amount; i++) {
      const card = deck.drawTop();
      if (card === null) {
        if (currentSegment.length > 0) {
          flipSegments.push({ cards: [...currentSegment], isHit: true });
        }
        const penalty = deck.getAndResetPenalty();
        return { damage: amount, cancelled: false, penalty, flipped, flipSegments };
      }
      flipped.push(card);
      currentSegment.push(card);
      // 处理虚拟肉
      if (card === 0 && deck.virtualMeat > 0) {
        deck.virtualMeat--;
      } else {
        deck.graveyard.push(card);
      }
      
      // 牌库空了立即洗牌
      if (deck.cards.length === 0 && deck.graveyard.length > 0) {
        flipSegments.push({ cards: [...currentSegment], isHit: true });
        currentSegment = [];
        deck.refresh();
        flipSegments.push({ refresh: true, newDeck: [...deck.cards] });
      }
    }
    
    if (currentSegment.length > 0) {
      flipSegments.push({ cards: [...currentSegment], isHit: true });
    }
    const penalty = deck.getAndResetPenalty();
    return { damage: amount, cancelled: false, penalty, flipped, flipSegments };
  },

  // cancel追X：上一段被cancel时才执行
  cancelChase: (deck, amount, lastResult) => {
    if (!lastResult || !lastResult.cancelled) {
      return { damage: 0, cancelled: false, penalty: 0, flipped: [], skipped: true };
    }
    return Actions.hit(deck, amount);
  },

  // 打中追X：上一段没被cancel时才执行
  hitChase: (deck, amount, lastResult) => {
    if (!lastResult || lastResult.cancelled || lastResult.skipped) {
      return { damage: 0, cancelled: false, penalty: 0, flipped: [], skipped: true };
    }
    return Actions.hit(deck, amount);
  }
};

export const ActionDefinitions = {
  hit1: { name: "打1", execute: (deck) => Actions.hit(deck, 1) },
  hit2: { name: "打2", execute: (deck) => Actions.hit(deck, 2) },
  hit3: { name: "打3", execute: (deck) => Actions.hit(deck, 3) },
  hit4: { name: "打4", execute: (deck) => Actions.hit(deck, 4) },
  hit5: { name: "打5", execute: (deck) => Actions.hit(deck, 5) },
  hit6: { name: "打6", execute: (deck) => Actions.hit(deck, 6) },
  hit7: { name: "打7", execute: (deck) => Actions.hit(deck, 7) },
  trueDmg1: { name: "真伤1", execute: (deck) => Actions.trueDamage(deck, 1) },
  trueDmg2: { name: "真伤2", execute: (deck) => Actions.trueDamage(deck, 2) },
  trueDmg3: { name: "真伤3", execute: (deck) => Actions.trueDamage(deck, 3) },
  mocha1: { name: "摩卡1", execute: (deck) => Actions.lookTopDiscardClimax(deck, 1) },
  mocha2: { name: "摩卡2", execute: (deck) => Actions.lookTopDiscardClimax(deck, 2) },
  mocha3: { name: "摩卡3", execute: (deck) => Actions.lookTopDiscardClimax(deck, 3) },
  mocha4: { name: "摩卡4", execute: (deck) => Actions.lookTopDiscardClimax(deck, 4) },
  antiMocha1: { name: "反摩卡1", execute: (deck) => Actions.lookTopDiscardMeat(deck, 1) },
  antiMocha2: { name: "反摩卡2", execute: (deck) => Actions.lookTopDiscardMeat(deck, 2) },
  antiMocha3: { name: "反摩卡3", execute: (deck) => Actions.lookTopDiscardMeat(deck, 3) },
  antiRefresh1: { name: "反洗1", execute: (deck) => Actions.antiRefresh(deck, 1) },
  antiRefresh2: { name: "反洗2", execute: (deck) => Actions.antiRefresh(deck, 2) },
  antiRefresh3: { name: "反洗3", execute: (deck) => Actions.antiRefresh(deck, 3) },
  antiRefresh4: { name: "反洗4", execute: (deck) => Actions.antiRefresh(deck, 4) },
  antiRefresh5: { name: "反洗5", execute: (deck) => Actions.antiRefresh(deck, 5) },
  putTop1: { name: "堆顶1", execute: (deck) => Actions.putTop(deck, 1) },
  putTop2: { name: "堆顶2", execute: (deck) => Actions.putTop(deck, 2) },
  putTop3: { name: "堆顶3", execute: (deck) => Actions.putTop(deck, 3) },
  flipHitX1: { name: "翻1打X", execute: (deck) => Actions.flipHitClimax(deck, 1) },
  flipHitX2: { name: "翻2打X", execute: (deck) => Actions.flipHitClimax(deck, 2) },
  flipHitX3: { name: "翻3打X", execute: (deck) => Actions.flipHitClimax(deck, 3) },
  flipHitX4: { name: "翻4打X", execute: (deck) => Actions.flipHitClimax(deck, 4) },
  flipHitX5: { name: "翻5打X", execute: (deck) => Actions.flipHitClimax(deck, 5) },
  flipHitX6: { name: "翻6打X", execute: (deck) => Actions.flipHitClimax(deck, 6) },
  flipHit11: { name: "翻1打1", execute: (deck) => Actions.flipHitOne(deck, 1) },
  flipHit12: { name: "翻2打1", execute: (deck) => Actions.flipHitOne(deck, 2) },
  flipHit13: { name: "翻3打1", execute: (deck) => Actions.flipHitOne(deck, 3) },
  flipHit14: { name: "翻4打1", execute: (deck) => Actions.flipHitOne(deck, 4) },
  flipHit15: { name: "翻5打1", execute: (deck) => Actions.flipHitOne(deck, 5) },
  flipHit16: { name: "翻6打1", execute: (deck) => Actions.flipHitOne(deck, 6) },
  flipHit21: { name: "翻1打2", execute: (deck) => Actions.flipHitTwo(deck, 1) },
  flipHit22: { name: "翻2打2", execute: (deck) => Actions.flipHitTwo(deck, 2) },
  flipHit23: { name: "翻3打2", execute: (deck) => Actions.flipHitTwo(deck, 3) },
  flipHit24: { name: "翻4打2", execute: (deck) => Actions.flipHitTwo(deck, 4) },
  flipHit25: { name: "翻5打2", execute: (deck) => Actions.flipHitTwo(deck, 5) },
  flipHit26: { name: "翻6打2", execute: (deck) => Actions.flipHitTwo(deck, 6) },
  flipHitXOnes1: { name: "翻1打X个1", execute: (deck) => Actions.flipHitXOnes(deck, 1) },
  flipHitXOnes2: { name: "翻2打X个1", execute: (deck) => Actions.flipHitXOnes(deck, 2) },
  flipHitXOnes3: { name: "翻3打X个1", execute: (deck) => Actions.flipHitXOnes(deck, 3) },
  flipHitXOnes4: { name: "翻4打X个1", execute: (deck) => Actions.flipHitXOnes(deck, 4) },
  flipHitXOnes5: { name: "翻5打X个1", execute: (deck) => Actions.flipHitXOnes(deck, 5) },
  flipHitXOnes6: { name: "翻6打X个1", execute: (deck) => Actions.flipHitXOnes(deck, 6) },
  cancelChase1: { name: "cancel追1", execute: (deck, lastResult) => Actions.cancelChase(deck, 1, lastResult) },
  cancelChase2: { name: "cancel追2", execute: (deck, lastResult) => Actions.cancelChase(deck, 2, lastResult) },
  cancelChase3: { name: "cancel追3", execute: (deck, lastResult) => Actions.cancelChase(deck, 3, lastResult) },
  cancelChase4: { name: "cancel追4", execute: (deck, lastResult) => Actions.cancelChase(deck, 4, lastResult) },
  cancelChase5: { name: "cancel追5", execute: (deck, lastResult) => Actions.cancelChase(deck, 5, lastResult) },
  hitChase1: { name: "打中追1", execute: (deck, lastResult) => Actions.hitChase(deck, 1, lastResult) },
  hitChase2: { name: "打中追2", execute: (deck, lastResult) => Actions.hitChase(deck, 2, lastResult) },
  hitChase3: { name: "打中追3", execute: (deck, lastResult) => Actions.hitChase(deck, 3, lastResult) },
  hitChase4: { name: "打中追4", execute: (deck, lastResult) => Actions.hitChase(deck, 4, lastResult) },
  hitChase5: { name: "打中追5", execute: (deck, lastResult) => Actions.hitChase(deck, 5, lastResult) },
  flipBottom4: { name: "翻底4", execute: (deck) => Actions.flipBottom(deck, 4) },
  flipBottom5: { name: "翻底5", execute: (deck) => Actions.flipBottom(deck, 5) }
};

export class Simulator {
  constructor(seed = 42) {
    this.seed = seed;
  }
  
  runOnce(totalCards, climaxCount, actionSequence, rng, initialCards = null, initialClimax = null) {
    const deck = new Deck(totalCards, climaxCount, rng, initialCards, initialClimax);
    let totalDamage = 0;
    let lastResult = null;
    
    for (const actionId of actionSequence) {
      if (deck.gameOver) break;
      
      const action = ActionDefinitions[actionId];
      if (!action) continue;
      
      const result = action.execute(deck, lastResult);
      
      if (result.damage !== undefined) {
        totalDamage += result.damage;
      }
      if (result.penalty !== undefined) {
        totalDamage += result.penalty;
      }
      
      lastResult = result;
    }
    
    return totalDamage;
  }
  
  simulate(totalCards, climaxCount, actionSequence, runs = 10000, initialCards = null, initialClimax = null) {
    const rng = new SeededRandom(this.seed);
    let totalDamage = 0;
    
    for (let i = 0; i < runs; i++) {
      totalDamage += this.runOnce(totalCards, climaxCount, actionSequence, rng, initialCards, initialClimax);
    }
    
    return totalDamage / runs;
  }
  
  generateTable(actionSequence, runs = 10000, initialCards = null, initialClimax = null) {
    const deckRange = [];
    for (let d = 16; d <= 35; d++) deckRange.push(d);
    
    const climaxRange = [3, 4, 5, 6, 7, 8];
    const results = {};
    
    for (const deck of deckRange) {
      results[deck] = {};
      for (const climax of climaxRange) {
        // 不合理情况：潮数大于牌库，或者初始牌库/潮数大于总牌库/潮数
        if (climax > deck) {
          results[deck][climax] = null;
        } else if (initialCards !== null && initialClimax !== null && 
                   (deck < initialCards || climax < initialClimax)) {
          results[deck][climax] = null;
        } else {
          results[deck][climax] = this.simulate(deck, climax, actionSequence, runs, initialCards, initialClimax);
        }
      }
    }
    
    return { deckRange, climaxRange, results };
  }

  // 详细模拟，记录每步过程
  runOnceDetailed(totalCards, climaxCount, actionSequence, rng, initialCards = null, initialClimax = null) {
    const deck = new Deck(totalCards, climaxCount, rng, initialCards, initialClimax);
    const initialDeckCards = [...deck.cards];
    const initialGraveyard = [...deck.graveyard];
    let totalDamage = 0;
    const steps = [];
    let lastResult = null;
    
    const formatCard = (c) => c === 1 ? '潮' : '肉';
    const formatCards = (cards) => cards.map(formatCard).join('');
    
    for (const actionId of actionSequence) {
      if (deck.gameOver) break;
      
      const action = ActionDefinitions[actionId];
      if (!action) continue;
      
      const result = action.execute(deck, lastResult);
      
      let stepDamage = 0;
      if (result.damage !== undefined) {
        stepDamage = result.damage;
        totalDamage += result.damage;
      }
      if (result.penalty !== undefined) {
        totalDamage += result.penalty;
      }
      
      // 构建详细描述
      let detail = '';
      let flipSegments = null;
      let hitResultsDetail = null;
      
      // 翻底打X个1：有hitResults表示是打多个1
      if (result.hitResults && result.hitResults.length > 0) {
        flipSegments = result.flipSegments.map(seg => {
          if (seg.refresh) {
            return { refresh: true, newDeck: formatCards(seg.newDeck) };
          } else {
            return { cards: formatCards(seg.cards), isFlipBottom: true };
          }
        });
        
        // 每次打1单独显示
        hitResultsDetail = result.hitResults.map((hr, idx) => {
          let card = formatCards(hr.flipped);
          return { card, damage: hr.damage, cancelled: hr.cancelled, penalty: hr.penalty };
        });
        
        if (result.climaxCount === 0) {
          detail = '→ 无潮不打';
        }
      }
      // 翻底打X/翻底打1/翻底打2：有flippedBottom表示是翻底类型
      else if (result.flippedBottom && result.flippedBottom.length > 0) {
        flipSegments = result.flipSegments.map(seg => {
          if (seg.refresh) {
            return { refresh: true, newDeck: formatCards(seg.newDeck) };
          } else {
            return { cards: formatCards(seg.cards), isFlipBottom: true };
          }
        });
        
        // 构建打的部分
        if (result.flipped && result.flipped.length > 0) {
          detail = '打: ' + formatCards(result.flipped);
          if (result.cancelled) {
            detail += ' → 被Cancel!';
          } else if (stepDamage > 0) {
            detail += ' → 造成' + stepDamage + '点伤害';
          }
        } else if (result.climaxCount === 0) {
          detail = '→ 无潮不打';
        }
      }
      // 普通打：有flipSegments且中间有洗牌
      else if (result.flipSegments && result.flipSegments.some(seg => seg.refresh)) {
        flipSegments = result.flipSegments.map(seg => {
          if (seg.refresh) {
            return { refresh: true, newDeck: formatCards(seg.newDeck) };
          } else {
            return { cards: formatCards(seg.cards), isHit: true };
          }
        });
        
        // 最终结果
        if (result.cancelled) {
          detail = '总计: ' + formatCards(result.flipped) + ' → 被Cancel!';
        } else if (stepDamage > 0) {
          detail = '总计: ' + formatCards(result.flipped) + ' → 造成' + stepDamage + '点伤害';
        }
      }
      // 摩卡：看了哪些牌
      else if (result.looked && result.looked.length > 0 && result.discardedClimax !== undefined) {
        detail = '看: ' + formatCards(result.looked);
        if (result.discardedClimax > 0) {
          detail += ' → 丢掉' + result.discardedClimax + '潮';
        } else {
          detail += ' → 无潮不丢';
        }
      }
      // 对手反摩卡：看了哪些牌，丢肉
      else if (result.looked && result.looked.length > 0 && result.discardedMeat !== undefined) {
        detail = '看: ' + formatCards(result.looked);
        if (result.discardedMeat > 0) {
          detail += ' → 丢掉' + result.discardedMeat + '肉';
        } else {
          detail += ' → 无肉不丢';
        }
      }
      // 反洗：加肉洗牌
      else if (result.addedMeat !== undefined) {
        detail = '加入' + result.addedMeat + '张肉并洗牌';
      }
      // 打/翻：翻出哪些牌
      else if (result.flipped && result.flipped.length > 0) {
        detail = '翻出: ' + formatCards(result.flipped);
        if (result.cancelled) {
          detail += ' → 被Cancel!';
        } else if (stepDamage > 0) {
          detail += ' → 造成' + stepDamage + '点伤害';
        }
      }
      // 堆顶
      else if (result.placed !== undefined) {
        detail = '堆顶' + result.placed + '张肉';
      }
      // 跳过的条件追击
      else if (result.skipped) {
        detail = '条件不满足，跳过';
      }
      // 其他情况
      else if (result.cancelled) {
        detail = '被Cancel!';
      } else if (stepDamage > 0) {
        detail = '造成' + stepDamage + '点伤害';
      }
      
      steps.push({
        action: action.name,
        detail: detail,
        damage: stepDamage,
        cancelled: result.cancelled || false,
        skipped: result.skipped || false,
        refreshEvents: deck.getAndResetRefreshEvents().map(cards => formatCards(cards)),
        penalty: result.penalty || 0,
        flipSegments: flipSegments,
        hitResultsDetail: hitResultsDetail,
        antiRefreshDeck: result.newDeck ? formatCards(result.newDeck) : null
      });
      
      lastResult = result;
    }
    
    return {
      initialDeck: formatCards(initialDeckCards),
      initialGraveyard: initialGraveyard.length > 0 ? formatCards(initialGraveyard) : null,
      steps,
      totalDamage
    };
  }

  // 生成N次详细模拟
  generateDetailedRuns(totalCards, climaxCount, actionSequence, count = 5, initialCards = null, initialClimax = null) {
    const rng = new SeededRandom(this.seed);
    const runs = [];
    for (let i = 0; i < count; i++) {
      runs.push(this.runOnceDetailed(totalCards, climaxCount, actionSequence, rng, initialCards, initialClimax));
    }
    return runs;
  }
}
