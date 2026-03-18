import { useState } from 'react'
import { Simulator, ActionDefinitions } from './simulator'
import './App.css'

function App() {
  const [flow, setFlow] = useState([])
  const [results, setResults] = useState(null)
  const [detailedRuns, setDetailedRuns] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  // 初始牌库（模拟对面快洗牌的场景）
  const [useInitialDeck, setUseInitialDeck] = useState(false)
  const [initialDeck, setInitialDeck] = useState(1)
  const [initialClimax, setInitialClimax] = useState(0)

  const [dragIndex, setDragIndex] = useState(null)
  const [optionsPanelOpen, setOptionsPanelOpen] = useState(false)

  const actionGroups = [
    { label: '常规伤害', actions: ['hit1', 'hit2', 'hit3', 'hit4', 'hit5', 'hit6', 'hit7'] },
    { label: '真伤', actions: ['trueDmg1', 'trueDmg2', 'trueDmg3'] },
    { label: '摩卡', actions: ['mocha1', 'mocha2', 'mocha3'] },
    { label: '堆顶', actions: ['putTop1', 'putTop2', 'putTop3'] },
    { label: '翻底', isFlipBottom: true },
    { label: 'cancel追X', actions: ['cancelChase1', 'cancelChase2', 'cancelChase3', 'cancelChase4', 'cancelChase5'] },
    { label: '打中追X', actions: ['hitChase1', 'hitChase2', 'hitChase3', 'hitChase4', 'hitChase5'] },
  ]

  const flipBottomTabs = [
    { label: '翻底打X', prefix: 'flipHitX', count: 6 },
    { label: '翻底打1', prefix: 'flipHit1', count: 6 },
    { label: '翻底打2', prefix: 'flipHit2', count: 6 },
    { label: '翻底打X个1', prefix: 'flipHitXOnes', count: 6 },
  ]

  const addAction = (actionId) => {
    setFlow([...flow, actionId])
  }

  const undoAction = () => {
    setFlow(flow.slice(0, -1))
  }

  const removeAction = (index) => {
    setFlow(flow.filter((_, i) => i !== index))
  }

  const clearFlow = () => {
    setFlow([])
    setResults(null)
    setDetailedRuns(null)
    setDetailsOpen(false)
    setStatus('')
  }

  const handleDragStart = (index) => {
    setDragIndex(index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    
    const newFlow = [...flow]
    const dragItem = newFlow[dragIndex]
    newFlow.splice(dragIndex, 1)
    newFlow.splice(index, 0, dragItem)
    setFlow(newFlow)
    setDragIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  // 触摸拖拽支持
  const [touchStartY, setTouchStartY] = useState(null)
  
  const handleTouchStart = (e, index) => {
    setDragIndex(index)
    setTouchStartY(e.touches[0].clientY)
  }

  const handleTouchMove = (e, index) => {
    if (dragIndex === null) return
    
    const touch = e.touches[0]
    const elements = document.querySelectorAll('.flow-item')
    
    for (let i = 0; i < elements.length; i++) {
      const rect = elements[i].getBoundingClientRect()
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        if (i !== dragIndex) {
          const newFlow = [...flow]
          const dragItem = newFlow[dragIndex]
          newFlow.splice(dragIndex, 1)
          newFlow.splice(i, 0, dragItem)
          setFlow(newFlow)
          setDragIndex(i)
        }
        break
      }
    }
  }

  const handleTouchEnd = () => {
    setDragIndex(null)
    setTouchStartY(null)
  }

  const runSimulation = async () => {
    if (flow.length === 0) {
      setStatus('请先添加动作！')
      return
    }

    setIsRunning(true)
    setStatus('模拟中...')

    await new Promise(resolve => setTimeout(resolve, 10))

    try {
      const simulator = new Simulator(42)
      const result = simulator.generateTable(
        flow, 
        10000,
        useInitialDeck ? initialDeck : null,
        useInitialDeck ? initialClimax : null
      )
      // 详细模拟用随机种子
      const detailSimulator = new Simulator(Date.now())
      const detailed = detailSimulator.generateDetailedRuns(
        25, 
        7, 
        flow, 
        5,
        useInitialDeck ? initialDeck : null,
        useInitialDeck ? initialClimax : null
      )
      setResults(result)
      setDetailedRuns(detailed)
      setStatus('完成！10000次模拟')
    } catch (e) {
      setStatus('错误: ' + e.message)
      console.error(e)
    }

    setIsRunning(false)
  }

  return (
    <div className="container">
      <h1>WS斩杀蒙特卡洛模拟器</h1>
      
      <div className="section build-section">
        <div className="build-left">
          <h2>构建斩杀流程</h2>
          {actionGroups.map(group => (
            group.isFlipBottom ? (
              <div key={group.label} className="action-group flip-bottom-group">
                <span className="group-label">{group.label}</span>
                <div className="flip-bottom-tabs">
                  {flipBottomTabs.map(tab => (
                    <div key={tab.label} className="dropdown-tab">
                      <span className="dropdown-tab-label">{tab.label}</span>
                      <div className="dropdown-menu">
                        <div className="dropdown-menu-inner">
                          {Array.from({length: tab.count}, (_, i) => i + 1).map(n => (
                            <button
                              key={n}
                              className="dropdown-item"
                              onClick={() => addAction(tab.prefix + n)}
                            >
                              翻{n}{tab.label.replace('翻底', '')}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div key={group.label} className="action-group">
                <span className="group-label">{group.label}</span>
                <div className="action-buttons">
                  {group.actions.map(actionId => (
                    <button 
                      key={actionId}
                      className="action-btn"
                      onClick={() => addAction(actionId)}
                    >
                      {ActionDefinitions[actionId].name}
                    </button>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
        
        <button 
          className="options-toggle-btn"
          onClick={() => setOptionsPanelOpen(!optionsPanelOpen)}
        >
          ⚙ 选项
        </button>
        
        <div className={`build-right ${optionsPanelOpen ? 'open' : ''}`}>
          <div className="build-right-header">
            <h3>详细模拟选项</h3>
            <button className="close-options-btn" onClick={() => setOptionsPanelOpen(false)}>×</button>
          </div>
          <div className={`option-group ${useInitialDeck ? '' : 'disabled'}`}>
            <div className="option-row">
              <label 
                className={`custom-checkbox-label ${useInitialDeck ? 'checked' : ''}`}
                onClick={() => setUseInitialDeck(!useInitialDeck)}
              >
                <span className="custom-checkbox"></span>
                自定义对手初始牌库
              </label>
            </div>
            <div className="option-row initial-deck-row">
              <label>对手初始牌库：</label>
              <input 
                type="number" 
                min="1" 
                max="35"
                value={initialDeck} 
                onChange={(e) => setInitialDeck(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={!useInitialDeck}
              />
              <span>张</span>
              <input 
                type="number" 
                min="0" 
                max={initialDeck}
                value={initialClimax} 
                onChange={(e) => setInitialClimax(Math.min(initialDeck, Math.max(0, parseInt(e.target.value) || 0)))}
                disabled={!useInitialDeck}
              />
              <span>潮</span>
            </div>
          </div>
        </div>
        
        {optionsPanelOpen && <div className="options-overlay" onClick={() => setOptionsPanelOpen(false)}></div>}
      </div>
      
      <div className="section">
        <div className="flow-display">
          <h3>当前流程：</h3>
          <div className="flow-list">
            {flow.length === 0 ? (
              <span className="placeholder">请选择动作...</span>
            ) : (
              flow.map((actionId, index) => (
                <span 
                  key={index} 
                  className={`flow-item ${dragIndex === index ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, index)}
                  onTouchMove={(e) => handleTouchMove(e, index)}
                  onTouchEnd={handleTouchEnd}
                >
                  {ActionDefinitions[actionId].name}
                  <button 
                    className="flow-item-close"
                    onClick={(e) => { e.stopPropagation(); removeAction(index); }}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flow-controls">
            <button className="control-btn" onClick={undoAction}>撤销</button>
            <button className="control-btn" onClick={clearFlow}>清空</button>
          </div>
        </div>
      </div>
      
      <div className="section">
        <button 
          className="run-btn" 
          onClick={runSimulation}
          disabled={isRunning}
        >
          运行模拟 (10000次)
        </button>
        {status && <div className="status">{status}</div>}
      </div>
      
      {results && (
        <div className="section">
          <h2>模拟结果</h2>
          
          {detailedRuns && (
            <div className="details-dropdown">
              <button 
                className="details-toggle"
                onClick={() => setDetailsOpen(!detailsOpen)}
              >
                {detailsOpen ? '▼' : '▶'} 查看前5次模拟详情 
                {useInitialDeck 
                  ? `（初始${initialDeck}张${initialClimax}潮 → 洗牌后25张7潮）`
                  : '（25张7潮）'
                }
              </button>
              {detailsOpen && (
                <div className="details-content">
                  {detailedRuns.map((run, i) => (
                    <div key={i} className="detail-run">
                      <div className="detail-header">
                        第{i + 1}次 - 总伤害: {run.totalDamage}
                      </div>
                      <div className="detail-deck">对手初始牌库: {run.initialDeck}</div>
                      {run.initialGraveyard && (
                        <div className="detail-graveyard">初始弃牌: {run.initialGraveyard}</div>
                      )}
                      {run.steps.map((step, j) => (
                        <div key={j}>
                          {/* 普通洗牌事件（非翻底） */}
                          {!step.flipSegments && step.refreshEvents && step.refreshEvents.length > 0 && step.refreshEvents.map((deckState, k) => (
                            <div key={`refresh-${k}`} className="detail-refresh">
                              <span>⚠ 洗牌！新牌库: {deckState}</span>
                              <span className="step-damage">+1</span>
                            </div>
                          ))}
                          
                          {/* 有分段显示（打X中间洗牌、翻底打X等） */}
                          {step.flipSegments && (
                            <>
                              <div className="detail-step">
                                <span className="step-action">{step.action}</span>
                              </div>
                              {step.flipSegments.map((seg, k) => (
                                seg.refresh ? (
                                  <div key={k} className="detail-refresh">
                                    <span>⚠ 洗牌！新牌库: {seg.newDeck}</span>
                                    <span className="step-damage">+1</span>
                                  </div>
                                ) : (
                                  <div key={k} className="detail-sub">
                                    {seg.isFlipBottom ? '翻底: ' : '翻出: '}{seg.cards}
                                  </div>
                                )
                              ))}
                              {/* 翻底打X个1的分行显示 */}
                              {step.hitResultsDetail && step.hitResultsDetail.length > 0 ? (
                                step.hitResultsDetail.map((hit, k) => (
                                  <div key={k} className={`detail-sub ${hit.cancelled ? 'cancelled' : ''}`}>
                                    打1: {hit.card} → {hit.cancelled ? '被Cancel!' : ''}
                                    {!hit.cancelled && hit.damage > 0 && <span className="step-damage">+{hit.damage}</span>}
                                  </div>
                                ))
                              ) : (
                                <div className={`detail-sub ${step.cancelled ? 'cancelled' : ''}`}>
                                  {step.detail}
                                  {step.damage > 0 && <span className="step-damage">+{step.damage}</span>}
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* 普通动作 */}
                          {!step.flipSegments && (
                            <div className={`detail-step ${step.cancelled ? 'cancelled' : ''} ${step.skipped ? 'skipped' : ''}`}>
                              <span className="step-action">{step.action}</span>
                              <span className="step-detail">{step.detail}</span>
                              {step.damage > 0 && <span className="step-damage">+{step.damage}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <div className="result-container">
            <ResultTable 
              deckRange={results.deckRange}
              climaxRange={results.climaxRange}
              results={results.results}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ResultTable({ deckRange, climaxRange, results }) {
  const isHighlight = (deck, climax) => {
    return deck >= 21 && deck <= 30 && climax >= 5 && climax <= 8
  }

  // 先找出表格中的最大最小值
  let minVal = Infinity, maxVal = -Infinity
  for (const deck of deckRange) {
    for (const cx of climaxRange) {
      const v = results[deck][cx]
      if (v !== null) {
        if (v < minVal) minVal = v
        if (v > maxVal) maxVal = v
      }
    }
  }

  // 根据数值大小给背景色渐变：微微变色，低->深蓝, 高->浅蓝
  const getValueStyle = (value) => {
    if (value === null) return { backgroundColor: '#1a1a2e' }
    const ratio = maxVal > minVal ? (value - minVal) / (maxVal - minVal) : 0.5
    // 深蓝(20,25,40) -> 浅蓝(60,105,140)
    const r = Math.round(20 + ratio * 40)
    const g = Math.round(25 + ratio * 80)
    const b = Math.round(40 + ratio * 100)
    return { backgroundColor: `rgb(${r}, ${g}, ${b})` }
  }

  return (
    <div>
      <table className="result-table">
      <thead>
        <tr>
          <th>牌数\潮数</th>
          {climaxRange.map(cx => (
            <th key={cx}>{cx}潮</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {deckRange.map(deck => (
          <tr key={deck}>
            <th>{deck}张</th>
            {climaxRange.map(cx => {
              const value = results[deck][cx]
              const inHighlight = deck >= 21 && deck <= 30 && cx >= 5 && cx <= 8
              
              // 计算边界位置
              const classes = []
              if (inHighlight) {
                if (deck === 21) classes.push('hl-top')
                if (deck === 30) classes.push('hl-bottom')
                if (cx === 5) classes.push('hl-left')
                if (cx === 8) classes.push('hl-right')
              }
              
              return (
                <td 
                  key={cx} 
                  className={classes.join(' ')}
                  style={getValueStyle(value)}
                >
                  {value === null ? '-' : value.toFixed(2)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
      <div className="table-note">蓝框内为常见压缩</div>
    </div>
  )
}

export default App
