import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sliders, Play, Pause, RotateCcw, Download, Zap } from 'lucide-react';

const CellularAutomataArtStudio = () => {
  // Canvas and grid state
  const [gridSize, setGridSize] = useState({ cols: 100, rows: 100 });
  const [cellSize, setCellSize] = useState(6);
  const [grid, setGrid] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [speed, setSpeed] = useState(100); // ms between generations
  const canvasRef = useRef(null);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  
  // Worker for computation
  const workerRef = useRef(null);
  
  // Rule settings
  const [rules, setRules] = useState({
    // Conway's Game of Life rules by default
    surviveMin: 2,
    surviveMax: 3,
    birthMin: 3,
    birthMax: 3,
    // Custom extensions
    states: 1, // Multiple cell states beyond binary
    neighborhood: 'moore', // Moore or Von Neumann
    wrapping: true, // Wrap around edges
  });
  
  // Appearance settings
  const [colorScheme, setColorScheme] = useState({
    background: '#000000',
    cellColors: ['#4ade80', '#2563eb', '#ec4899', '#f59e0b', '#8b5cf6'], // Different colors based on cell state
    trailEffect: false,
    trailLength: 5,
    fadeEffect: false,
  });
  
  // Saved rulesets
  const [savedRulesets, setSavedRulesets] = useState({});
  const [rulesetName, setRulesetName] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showTooltip, setShowTooltip] = useState('');

  // Initialize grid
  const initializeGrid = useCallback(() => {
    const newGrid = Array(gridSize.rows).fill().map(() => 
      Array(gridSize.cols).fill().map(() => ({
        state: 0,
        age: 0,
        previousStates: [],
        changed: false
      }))
    );
    setGrid(newGrid);
    setGeneration(0);
  }, [gridSize]);

  // Initialize on component mount
  useEffect(() => {
    initializeGrid();
    
    // Load saved rulesets from localStorage
    const savedRulesetsJSON = localStorage.getItem('cellular-automata-rulesets');
    if (savedRulesetsJSON) {
      try {
        setSavedRulesets(JSON.parse(savedRulesetsJSON));
      } catch (e) {
        console.error("Error loading saved rulesets:", e);
      }
    }
    
    // Initialize web worker for computation
    if (window.Worker) {
      const workerCode = `
        self.onmessage = function(e) {
          const { grid, rules, gridSize, colorScheme } = e.data;
          const { surviveMin, surviveMax, birthMin, birthMax, states, neighborhood, wrapping } = rules;
          const { trailEffect, trailLength } = colorScheme;
          
          const newGrid = JSON.parse(JSON.stringify(grid));
          const changedCells = [];
          
          for (let y = 0; y < gridSize.rows; y++) {
            for (let x = 0; x < gridSize.cols; x++) {
              const cell = grid[y][x];
              
              // Count live neighbors
              let neighbors = 0;
              let stateSum = 0;
              
              // Moore neighborhood (8 adjacent cells) or Von Neumann (4 adjacent cells)
              const directions = neighborhood === 'moore' 
                ? [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] 
                : [[-1,0],[0,-1],[0,1],[1,0]];
              
              for (const [dy, dx] of directions) {
                let ny = y + dy;
                let nx = x + dx;
                
                // Handle wrapping
                if (wrapping) {
                  ny = (ny + gridSize.rows) % gridSize.rows;
                  nx = (nx + gridSize.cols) % gridSize.cols;
                } else if (ny < 0 || ny >= gridSize.rows || nx < 0 || nx >= gridSize.cols) {
                  continue;
                }
                
                if (grid[ny][nx].state > 0) {
                  neighbors++;
                  stateSum += grid[ny][nx].state;
                }
              }
              
              // Apply rules
              let cellChanged = false;
              let newState = cell.state;
              let newAge = cell.age;
              
              if (cell.state > 0) {
                // Survival rules
                if (neighbors >= surviveMin && neighbors <= surviveMax) {
                  // Cell stays alive and potentially changes state
                  if (states > 1) {
                    // Complex state transition logic
                    const nextState = Math.min(cell.state + 1, states);
                    if (nextState !== cell.state) {
                      newState = nextState;
                      cellChanged = true;
                    }
                  }
                  // Update age for tracking
                  newAge = cell.age + 1;
                  cellChanged = cellChanged || (cell.age !== newAge);
                } else {
                  // Cell dies
                  if (trailEffect) {
                    newAge = cell.age + 1;
                    if (newAge > trailLength) {
                      newState = 0;
                      newAge = 0;
                    }
                  } else {
                    newState = 0;
                    newAge = 0;
                  }
                  cellChanged = true;
                }
              } else {
                // Birth rules
                if (neighbors >= birthMin && neighbors <= birthMax) {
                  // Calculate new state for multi-state rules
                  newState = 1;
                  if (states > 1) {
                    // Average of neighbors' states, rounded
                    newState = Math.max(1, Math.min(Math.round(stateSum / neighbors), states));
                  }
                  newAge = 0;
                  cellChanged = true;
                }
              }
              
              if (cellChanged) {
                newGrid[y][x].state = newState;
                newGrid[y][x].age = newAge;
                newGrid[y][x].changed = true;
                changedCells.push({ x, y });
              } else {
                newGrid[y][x].changed = false;
              }
            }
          }
          
          self.postMessage({ newGrid, changedCells });
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerURL = URL.createObjectURL(blob);
      workerRef.current = new Worker(workerURL);
      
      workerRef.current.onmessage = (e) => {
        const { newGrid, changedCells } = e.data;
        setGrid(newGrid);
        setGeneration(prev => prev + 1);
      };
      
      // Clean up
      return () => {
        if (workerRef.current) {
          workerRef.current.terminate();
          URL.revokeObjectURL(workerURL);
        }
      };
    }
  }, [initializeGrid]);
  
  // Handle window resize with aspect ratio preservation
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const container = containerRef.current;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Adjust canvas size based on both container dimensions
        const widthConstraint = Math.floor(containerWidth / gridSize.cols);
        const heightConstraint = Math.floor(containerHeight / gridSize.rows);
        
        // Use the more constraining dimension to maintain aspect ratio
        const newCellSize = Math.max(2, Math.min(widthConstraint, heightConstraint));
        
        if (newCellSize !== cellSize) {
          setCellSize(newCellSize);
          
          // Reset view when cell size changes significantly
          if (Math.abs(newCellSize - cellSize) > 1) {
            resetView();
          }
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [gridSize.cols, gridSize.rows, cellSize]);

  // Draw the grid to canvas with viewport optimization
  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = gridSize.cols * cellSize;
    const height = gridSize.rows * cellSize;
    
    // Apply zoom and pan transformations
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    // Clear canvas with background color
    ctx.fillStyle = colorScheme.background;
    ctx.fillRect(0, 0, width, height);
    
    // Calculate visible viewport in grid coordinates
    const viewportLeft = Math.max(0, Math.floor(-pan.x / (cellSize * zoom)));
    const viewportTop = Math.max(0, Math.floor(-pan.y / (cellSize * zoom)));
    const viewportRight = Math.min(gridSize.cols, Math.ceil((canvas.width - pan.x) / (cellSize * zoom)));
    const viewportBottom = Math.min(gridSize.rows, Math.ceil((canvas.height - pan.y) / (cellSize * zoom)));
    
    // Optimize: Only redraw cells in viewport
    const shouldDrawAll = zoom !== 1 || pan.x !== 0 || pan.y !== 0;
    
    if (shouldDrawAll) {
      // Draw visible cells (when zoomed or panned)
      for (let y = viewportTop; y < viewportBottom; y++) {
        for (let x = viewportLeft; x < viewportRight; x++) {
          const cell = grid[y][x];
          if (cell.state > 0) {
            // Get color based on state
            const colorIndex = Math.min(cell.state, colorScheme.cellColors.length) - 1;
            ctx.fillStyle = colorScheme.cellColors[colorIndex];
            
            // Apply trail or fade effect if enabled
            if (colorScheme.trailEffect && cell.age > 0) {
              const alpha = Math.max(0.2, 1 - (cell.age / colorScheme.trailLength));
              ctx.globalAlpha = alpha;
            } else if (colorScheme.fadeEffect) {
              // Fade in new cells
              const fadeInRate = Math.min(1, cell.age / 3);
              ctx.globalAlpha = fadeInRate;
            } else {
              ctx.globalAlpha = 1;
            }
            
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    } else {
      // Performance optimization: Only draw changed cells in viewport
      for (let y = viewportTop; y < viewportBottom; y++) {
        for (let x = viewportLeft; x < viewportRight; x++) {
          const cell = grid[y][x];
          if (cell.changed) {
            // Clear the cell area first
            ctx.fillStyle = colorScheme.background;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            
            // Draw the cell if it's alive
            if (cell.state > 0) {
              const colorIndex = Math.min(cell.state, colorScheme.cellColors.length) - 1;
              ctx.fillStyle = colorScheme.cellColors[colorIndex];
              
              if (colorScheme.trailEffect && cell.age > 0) {
                const alpha = Math.max(0.2, 1 - (cell.age / colorScheme.trailLength));
                ctx.globalAlpha = alpha;
              } else if (colorScheme.fadeEffect) {
                const fadeInRate = Math.min(1, cell.age / 3);
                ctx.globalAlpha = fadeInRate;
              } else {
                ctx.globalAlpha = 1;
              }
              
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
          }
        }
      }
    }
    
    // Draw grid lines when zoomed in enough
    if (zoom >= 4) {
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5 / zoom;
      
      for (let x = 0; x <= width; x += cellSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      for (let y = 0; y <= height; y += cellSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }, [grid, cellSize, gridSize, colorScheme, zoom, pan]);

  useEffect(() => {
    drawGrid();
  }, [grid, drawGrid]);

  // Calculate the next generation using Web Worker if available
  const computeNextGeneration = useCallback(() => {
    if (workerRef.current) {
      // Use web worker for computation
      workerRef.current.postMessage({
        grid,
        rules,
        colorScheme,
        gridSize
      });
    } else {
      // Fallback to computation on main thread
      const { surviveMin, surviveMax, birthMin, birthMax, states, neighborhood, wrapping } = rules;
      
      const newGrid = JSON.parse(JSON.stringify(grid));
      
      for (let y = 0; y < gridSize.rows; y++) {
        for (let x = 0; x < gridSize.cols; x++) {
          const cell = grid[y][x];
          
          // Count live neighbors
          let neighbors = 0;
          let stateSum = 0;
          
          // Moore neighborhood (8 adjacent cells) or Von Neumann (4 adjacent cells)
          const directions = neighborhood === 'moore' 
            ? [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] 
            : [[-1,0],[0,-1],[0,1],[1,0]];
          
          for (const [dy, dx] of directions) {
            let ny = y + dy;
            let nx = x + dx;
            
            // Handle wrapping
            if (wrapping) {
              ny = (ny + gridSize.rows) % gridSize.rows;
              nx = (nx + gridSize.cols) % gridSize.cols;
            } else if (ny < 0 || ny >= gridSize.rows || nx < 0 || nx >= gridSize.cols) {
              continue;
            }
            
            if (grid[ny][nx].state > 0) {
              neighbors++;
              stateSum += grid[ny][nx].state;
            }
          }
          
          // Apply rules
          let cellChanged = false;
          
          if (cell.state > 0) {
            // Survival rules
            if (neighbors >= surviveMin && neighbors <= surviveMax) {
              // Cell stays alive and potentially changes state
              if (states > 1) {
                // Complex state transition logic
                const nextState = Math.min(cell.state + 1, states);
                if (nextState !== cell.state) {
                  newGrid[y][x].state = nextState;
                  cellChanged = true;
                }
              }
              // Update age for tracking
              newGrid[y][x].age += 1;
              cellChanged = cellChanged || (cell.age !== newGrid[y][x].age);
            } else {
              // Cell dies
              if (colorScheme.trailEffect) {
                newGrid[y][x].age = cell.age + 1;
                if (newGrid[y][x].age > colorScheme.trailLength) {
                  newGrid[y][x].state = 0;
                  newGrid[y][x].age = 0;
                }
              } else {
                newGrid[y][x].state = 0;
                newGrid[y][x].age = 0;
              }
              cellChanged = true;
            }
          } else {
            // Birth rules
            if (neighbors >= birthMin && neighbors <= birthMax) {
              // Calculate new state for multi-state rules
              let newState = 1;
              if (states > 1) {
                // Average of neighbors' states, rounded
                newState = Math.max(1, Math.min(Math.round(stateSum / neighbors), states));
              }
              newGrid[y][x].state = newState;
              newGrid[y][x].age = 0;
              cellChanged = true;
            }
          }
          
          newGrid[y][x].changed = cellChanged;
        }
      }
      
      setGrid(newGrid);
      setGeneration(prev => prev + 1);
    }
  }, [grid, rules, gridSize, colorScheme.trailEffect, colorScheme.trailLength]);

  // Animation loop
  useEffect(() => {
    if (isRunning) {
      timeoutRef.current = setTimeout(() => {
        computeNextGeneration();
      }, speed);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isRunning, computeNextGeneration, generation, speed]);

  // Handle canvas interaction with zoom and pan support
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(1); // 1 = draw, 0 = erase
  
  // Convert screen coordinates to grid coordinates with zoom/pan
  const screenToGrid = useCallback((screenX, screenY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate actual position considering zoom and pan
    const canvasX = (screenX - rect.left);
    const canvasY = (screenY - rect.top);
    
    // Adjust for zoom and pan
    const gridX = Math.floor(((canvasX - pan.x) / zoom) / cellSize);
    const gridY = Math.floor(((canvasY - pan.y) / zoom) / cellSize);
    
    return { x: gridX, y: gridY };
  }, [cellSize, zoom, pan]);
  
  // Canvas click handler for drawing
  const handleCanvasClick = (e) => {
    if (isPanning) return;
    
    const { x, y } = screenToGrid(e.clientX, e.clientY);
    
    if (x >= 0 && x < gridSize.cols && y >= 0 && y < gridSize.rows) {
      const newGrid = [...grid];
      const currentState = newGrid[y][x].state;
      
      // Cycle through states on click
      newGrid[y][x].state = (currentState + 1) % (rules.states + 1);
      newGrid[y][x].age = 0;
      newGrid[y][x].changed = true;
      
      setGrid(newGrid);
    }
  };

  // Handle canvas drag for drawing or panning
  const handleCanvasMouseDown = (e) => {
    // Right-click or ctrl+click for panning
    if (e.button === 2 || e.ctrlKey) {
      e.preventDefault();
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (isRunning) return;
    
    setIsDrawing(true);
    
    const { x, y } = screenToGrid(e.clientX, e.clientY);
    
    if (x >= 0 && x < gridSize.cols && y >= 0 && y < gridSize.rows) {
      const newGrid = [...grid];
      const currentState = newGrid[y][x].state;
      
      // Set draw mode based on first click
      setDrawMode(currentState === 0 ? 1 : 0);
      
      // Apply draw mode
      newGrid[y][x].state = currentState === 0 ? 1 : 0;
      newGrid[y][x].age = 0;
      newGrid[y][x].changed = true;
      
      setGrid(newGrid);
    }
  };

  const handleCanvasMouseMove = (e) => {
    // Handle panning
    if (isPanning) {
      const deltaX = e.clientX - lastPanPoint.x;
      const deltaY = e.clientY - lastPanPoint.y;
      
      // Apply constraint to keep grid partially visible
      const newPan = constrainPan({
        x: pan.x + deltaX,
        y: pan.y + deltaY
      });
      
      setPan(newPan);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    
    // Handle drawing
    if (!isDrawing || isRunning) return;
    
    const { x, y } = screenToGrid(e.clientX, e.clientY);
    
    if (x >= 0 && x < gridSize.cols && y >= 0 && y < gridSize.rows) {
      const newGrid = [...grid];
      
      // Apply current draw mode
      if (newGrid[y][x].state !== (drawMode ? 1 : 0)) {
        newGrid[y][x].state = drawMode ? 1 : 0;
        newGrid[y][x].age = 0;
        newGrid[y][x].changed = true;
        setGrid(newGrid);
      }
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
    setIsPanning(false);
  };
  
  // Zoom handling with mouse wheel and adaptive performance
  const handleMouseWheel = (e) => {
    e.preventDefault();
    
    // Adjust delta based on current zoom for smoother zooming
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    
    // Limit maximum zoom based on grid size for performance
    const maxZoom = Math.min(10, 2000 / Math.max(gridSize.cols, gridSize.rows));
    const newZoom = Math.max(0.5, Math.min(maxZoom, zoom + delta));
    
    // Zoom toward mouse position
    if (newZoom !== zoom) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate new pan to keep mouse position fixed
      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);
      
      setZoom(newZoom);
      
      // Apply constraints to keep grid partially visible
      setPan(constrainPan({ x: newPanX, y: newPanY }));
    }
  };
  
  // Reset zoom and pan
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Expanded preset patterns
  const patterns = {
    // Basic patterns
    glider: [
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 1]
    ],
    pulsar: [
      [0,0,1,1,1,0,0,0,1,1,1,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [0,0,1,1,1,0,0,0,1,1,1,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,1,1,1,0,0,0,1,1,1,0,0],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,1,1,1,0,0,0,1,1,1,0,0]
    ],
    pentadecathlon: [
      [0,0,1,0,0,0,0,1,0,0],
      [1,1,0,1,1,1,1,0,1,1],
      [0,0,1,0,0,0,0,1,0,0]
    ],
    gosperGliderGun: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1],
      [0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1],
      [1,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [1,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,1,1,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    ],
    spaceship: [
      [0,1,0,0,1],
      [1,0,0,0,0],
      [1,0,0,0,1],
      [1,1,1,1,0]
    ],
    acorn: [
      [0,1,0,0,0,0,0],
      [0,0,0,1,0,0,0],
      [1,1,0,0,1,1,1]
    ],
    flower: [
      [0,0,0,0,1,0,0,0,0],
      [0,0,0,1,0,1,0,0,0],
      [0,0,0,1,0,1,0,0,0],
      [0,1,1,0,0,0,1,1,0],
      [1,0,0,0,0,0,0,0,1],
      [0,1,1,0,0,0,1,1,0],
      [0,0,0,1,0,1,0,0,0],
      [0,0,0,1,0,1,0,0,0],
      [0,0,0,0,1,0,0,0,0]
    ],
    
    // Additional patterns
    diehard: [
      [0,0,0,0,0,0,1,0],
      [1,1,0,0,0,0,0,0],
      [0,1,0,0,0,1,1,1]
    ],
    rpentomino: [
      [0,1,1],
      [1,1,0],
      [0,1,0]
    ],
    infiniteGrowth1: [
      [0,0,0,0,1,0,0,0,0,0],
      [0,0,0,1,0,1,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0],
      [0,0,0,0,1,0,0,0,0,0],
      [1,1,0,0,0,0,0,0,1,1],
      [1,1,0,0,0,0,0,0,1,1],
      [0,0,0,0,1,0,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0],
      [0,0,0,1,0,1,0,0,0,0],
      [0,0,0,0,1,0,0,0,0,0]
    ],
    puffer: [
      [1,0,0,0,1,0],
      [0,0,1,0,0,1],
      [1,1,0,1,1,1]
    ],
    koggeStone: [
      [0,1,1,0,1,1,0],
      [1,0,0,1,0,0,1],
      [1,0,0,0,0,0,1],
      [0,1,0,0,0,1,0],
      [0,0,1,1,1,0,0]
    ],
    queenBee: [
      [0,0,0,1,0,0,0],
      [0,0,1,0,1,0,0],
      [0,1,0,0,0,1,0],
      [1,0,0,0,0,0,1],
      [1,0,0,0,0,0,1],
      [0,0,1,1,1,0,0]
    ],
    // Oscillators
    beacon: [
      [1,1,0,0],
      [1,1,0,0],
      [0,0,1,1],
      [0,0,1,1]
    ],
    toad: [
      [0,1,1,1],
      [1,1,1,0]
    ],
    clock: [
      [0,0,1,0],
      [1,0,1,0],
      [0,1,0,1],
      [0,1,0,0]
    ]
  };

  const applyPattern = (pattern) => {
    const newGrid = JSON.parse(JSON.stringify(grid));
    const centerY = Math.floor(gridSize.rows / 2) - Math.floor(pattern.length / 2);
    const centerX = Math.floor(gridSize.cols / 2) - Math.floor(pattern[0].length / 2);
    
    for (let y = 0; y < pattern.length; y++) {
      for (let x = 0; x < pattern[0].length; x++) {
        const gridY = centerY + y;
        const gridX = centerX + x;
        
        if (gridY >= 0 && gridY < gridSize.rows && gridX >= 0 && gridX < gridSize.cols) {
          newGrid[gridY][gridX].state = pattern[y][x];
          newGrid[gridY][gridX].age = 0;
        }
      }
    }
    
    setGrid(newGrid);
    setGeneration(0);
  };

  // Create custom ruleset presets
  const rulePresets = {
    gameOfLife: { surviveMin: 2, surviveMax: 3, birthMin: 3, birthMax: 3, states: 1 },
    dayAndNight: { surviveMin: 3, surviveMax: 6, birthMin: 3, birthMax: 6, states: 1 },
    seeds: { surviveMin: 0, surviveMax: 0, birthMin: 2, birthMax: 2, states: 1 },
    serviettes: { surviveMin: 0, surviveMax: 0, birthMin: 2, birthMax: 4, states: 1 },
    coral: { surviveMin: 4, surviveMax: 8, birthMin: 3, birthMax: 3, states: 1 },
    maze: { surviveMin: 1, surviveMax: 5, birthMin: 3, birthMax: 3, states: 1 },
    multicolor: { surviveMin: 2, surviveMax: 3, birthMin: 3, birthMax: 3, states: 5 },
  };

  const applyRulePreset = (preset) => {
    setRules(prev => ({
      ...prev,
      ...rulePresets[preset]
    }));
  };

  // UI handlers
  const toggleSimulation = () => {
    setIsRunning(!isRunning);
  };
  
  const resetGrid = () => {
    setIsRunning(false);
    initializeGrid();
  };
  
  const handleRuleChange = (key, value) => {
    setRules(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  const handleColorChange = (key, value) => {
    setColorScheme(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Download image
  const downloadImage = () => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `cellular-automata-art-gen${generation}.png`;
    link.href = dataUrl;
    link.click();
  };

  // Random fill
  const randomFill = (density = 0.3) => {
    const newGrid = JSON.parse(JSON.stringify(grid));
    
    for (let y = 0; y < gridSize.rows; y++) {
      for (let x = 0; x < gridSize.cols; x++) {
        if (Math.random() < density) {
          // For multiple states, randomly choose a state
          newGrid[y][x].state = rules.states > 1 
            ? Math.floor(Math.random() * rules.states) + 1 
            : 1;
        } else {
          newGrid[y][x].state = 0;
        }
        newGrid[y][x].age = 0;
      }
    }
    
    setGrid(newGrid);
    setGeneration(0);
  };

  // Save and load custom rulesets
  const saveCurrentRuleset = () => {
    if (!rulesetName.trim()) return;
    
    const newSavedRulesets = {
      ...savedRulesets,
      [rulesetName]: {
        ...rules,
        colorScheme: colorScheme
      }
    };
    
    setSavedRulesets(newSavedRulesets);
    localStorage.setItem('cellular-automata-rulesets', JSON.stringify(newSavedRulesets));
    setRulesetName('');
  };
  
  const loadRuleset = (name) => {
    const savedRuleset = savedRulesets[name];
    if (savedRuleset) {
      const { colorScheme: savedColorScheme, ...savedRules } = savedRuleset;
      setRules(savedRules);
      if (savedColorScheme) {
        setColorScheme(savedColorScheme);
      }
    }
  };
  
  const deleteRuleset = (name) => {
    const newSavedRulesets = { ...savedRulesets };
    delete newSavedRulesets[name];
    setSavedRulesets(newSavedRulesets);
    localStorage.setItem('cellular-automata-rulesets', JSON.stringify(newSavedRulesets));
  };
  
  // Pattern import/export
  const exportCurrentPattern = () => {
    // Create a simple format to represent the pattern
    const patternData = [];
    
    // Scan the grid to find the pattern bounds
    let minX = gridSize.cols;
    let minY = gridSize.rows;
    let maxX = 0;
    let maxY = 0;
    
    // Find the bounds of the pattern
    for (let y = 0; y < gridSize.rows; y++) {
      for (let x = 0; x < gridSize.cols; x++) {
        if (grid[y][x].state > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    // Extract the pattern
    for (let y = minY; y <= maxY; y++) {
      const row = [];
      for (let x = minX; x <= maxX; x++) {
        row.push(grid[y][x].state);
      }
      patternData.push(row);
    }
    
    // Convert to JSON and create a download link
    const dataStr = JSON.stringify(patternData);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    
    const exportName = `pattern-${Date.now()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportName);
    linkElement.click();
  };
  
  // Pattern import
  const importPattern = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const pattern = JSON.parse(e.target.result);
        if (Array.isArray(pattern) && pattern.length > 0 && Array.isArray(pattern[0])) {
          applyPattern(pattern);
        }
      } catch (error) {
        console.error("Error importing pattern:", error);
      }
    };
    reader.readAsText(file);
  };
  
  // Render tooltip
  const renderTooltip = () => {
    if (!showTooltip) return null;
    
    const tooltips = {
      'surviveRules': 'Cells with this many neighbors will survive to the next generation',
      'birthRules': 'Empty cells with this many neighbors will become alive in the next generation',
      'states': 'Number of different cell states/colors - enables cells to age through different visual states',
      'neighborhood': 'Moore: Uses all 8 surrounding cells. Von Neumann: Uses only 4 adjacent cells (N,E,S,W)',
      'wrapping': 'When enabled, the grid wraps around at the edges, creating a toroidal surface',
      'trail': 'Leaves a fading trail as cells die, creating motion effects',
      'fade': 'New cells gradually fade in rather than appearing instantly',
      'multistate': 'Cells progress through multiple states/colors as they age, creating more complex visuals'
    };
    
    return (
      <div className="absolute bg-gray-800 border border-gray-600 p-2 rounded-lg text-sm z-10 max-w-xs">
        {tooltips[showTooltip]}
      </div>
    );
  };
  
  return (
    <div className="flex flex-col w-full max-w-6xl mx-auto p-4 bg-gray-900 text-white">
      <div className="flex flex-col items-center mb-6">
        <h1 className="text-3xl font-bold mb-2">Cellular Automata Art Studio</h1>
        <p className="text-gray-300 mb-4">Design evolving patterns with custom rules and watch emergent art come to life</p>
        
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          <button 
            className={`flex items-center px-4 py-2 rounded-lg ${isRunning ? 'bg-red-500' : 'bg-green-500'}`}
            onClick={toggleSimulation}
          >
            {isRunning ? <><Pause size={18} className="mr-2" /> Pause</> : <><Play size={18} className="mr-2" /> Play</>}
          </button>
          
          <button 
            className="flex items-center px-4 py-2 bg-blue-500 rounded-lg"
            onClick={resetGrid}
          >
            <RotateCcw size={18} className="mr-2" /> Reset
          </button>
          
          <button 
            className="flex items-center px-4 py-2 bg-purple-500 rounded-lg"
            onClick={() => randomFill(0.3)}
          >
            <Zap size={18} className="mr-2" /> Random
          </button>
          
          <button 
            className="flex items-center px-4 py-2 bg-yellow-500 rounded-lg"
            onClick={downloadImage}
          >
            <Download size={18} className="mr-2" /> Save Image
          </button>
          
          <button
            className="flex items-center px-4 py-2 bg-indigo-500 rounded-lg"
            onClick={resetView}
          >
            Reset View
          </button>
          
          <button
            className="flex items-center px-4 py-2 bg-teal-500 rounded-lg"
            onClick={() => setShowHelp(true)}
          >
            Help
          </button>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="text-sm">Generation: {generation}</div>
          
          <div className="flex items-center">
            <span className="text-sm mr-2">Speed:</span>
            <input 
              type="range" 
              min="20" 
              max="500"
              value={500 - speed}
              onChange={(e) => setSpeed(500 - parseInt(e.target.value))}
              className="w-32"
            />
          </div>
          
          <div className="flex items-center">
            <span className="text-sm mr-2">Zoom: {zoom.toFixed(1)}x</span>
            <input 
              type="range" 
              min="0.5" 
              max="5"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-32"
            />
          </div>
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row w-full gap-6">
        {/* Canvas container */}
        <div ref={containerRef} className="flex-grow flex justify-center relative">
          {renderTooltip()}
          <canvas 
            ref={canvasRef} 
            width={gridSize.cols * cellSize} 
            height={gridSize.rows * cellSize}
            onClick={handleCanvasClick}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleMouseWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="border border-gray-700 bg-black cursor-pointer"
          />
          <div className="absolute top-2 left-2 text-xs bg-gray-800 bg-opacity-70 p-1 rounded">
            Use mouse wheel to zoom | Ctrl+drag or right-click drag to pan
          </div>
        </div>
        
        {/* Controls */}
        <div className="w-full lg:w-64 flex flex-col space-y-6 bg-gray-800 p-4 rounded-lg">
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <Sliders size={18} className="mr-2" /> Rule Settings
              <button 
                className="ml-2 text-gray-400 hover:text-white"
                onMouseEnter={() => setShowTooltip('surviveRules')}
                onMouseLeave={() => setShowTooltip('')}
              >
                ?
              </button>
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1 flex justify-between">
                  <span>Survive Min-Max</span>
                  <button 
                    className="text-gray-400 hover:text-white text-xs"
                    onMouseEnter={() => setShowTooltip('surviveRules')}
                    onMouseLeave={() => setShowTooltip('')}
                  >
                    ?
                  </button>
                </label>
                <div className="flex space-x-2">
                  <input 
                    type="number" 
                    min="0" 
                    max="8"
                    value={rules.surviveMin}
                    onChange={(e) => handleRuleChange('surviveMin', parseInt(e.target.value))}
                    className="w-16 px-2 py-1 bg-gray-700 rounded"
                  />
                  <span>-</span>
                  <input 
                    type="number" 
                    min="0" 
                    max="8"
                    value={rules.surviveMax}
                    onChange={(e) => handleRuleChange('surviveMax', parseInt(e.target.value))}
                    className="w-16 px-2 py-1 bg-gray-700 rounded"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm mb-1 flex justify-between">
                  <span>Birth Min-Max</span>
                  <button 
                    className="text-gray-400 hover:text-white text-xs"
                    onMouseEnter={() => setShowTooltip('birthRules')}
                    onMouseLeave={() => setShowTooltip('')}
                  >
                    ?
                  </button>
                </label>
                <div className="flex space-x-2">
                  <input 
                    type="number" 
                    min="0" 
                    max="8"
                    value={rules.birthMin}
                    onChange={(e) => handleRuleChange('birthMin', parseInt(e.target.value))}
                    className="w-16 px-2 py-1 bg-gray-700 rounded"
                  />
                  <span>-</span>
                  <input 
                    type="number" 
                    min="0" 
                    max="8"
                    value={rules.birthMax}
                    onChange={(e) => handleRuleChange('birthMax', parseInt(e.target.value))}
                    className="w-16 px-2 py-1 bg-gray-700 rounded"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm mb-1 flex justify-between">
                  <span>Cell States</span>
                  <button 
                    className="text-gray-400 hover:text-white text-xs"
                    onMouseEnter={() => setShowTooltip('states')}
                    onMouseLeave={() => setShowTooltip('')}
                  >
                    ?
                  </button>
                </label>
                <input 
                  type="range" 
                  min="1" 
                  max="5"
                  value={rules.states}
                  onChange={(e) => handleRuleChange('states', parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-400">{rules.states} state{rules.states > 1 ? 's' : ''}</div>
              </div>
              
              <div>
                <label className="block text-sm mb-1 flex justify-between">
                  <span>Neighborhood</span>
                  <button 
                    className="text-gray-400 hover:text-white text-xs"
                    onMouseEnter={() => setShowTooltip('neighborhood')}
                    onMouseLeave={() => setShowTooltip('')}
                  >
                    ?
                  </button>
                </label>
                <select 
                  value={rules.neighborhood}
                  onChange={(e) => handleRuleChange('neighborhood', e.target.value)}
                  className="w-full px-2 py-1 bg-gray-700 rounded"
                >
                  <option value="moore">Moore (8 cells)</option>
                  <option value="von-neumann">Von Neumann (4 cells)</option>
                </select>
              </div>
              
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="wrapping"
                  checked={rules.wrapping}
                  onChange={(e) => handleRuleChange('wrapping', e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="wrapping" className="text-sm">Edge Wrapping</label>
                <button 
                  className="ml-2 text-gray-400 hover:text-white text-xs"
                  onMouseEnter={() => setShowTooltip('wrapping')}
                  onMouseLeave={() => setShowTooltip('')}
                >
                  ?
                </button>
              </div>
              
              <div>
                <label className="block text-sm mb-1">Rule Presets</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    className="px-2 py-1 bg-gray-700 rounded text-xs"
                    onClick={() => applyRulePreset('gameOfLife')}
                  >
                    Game of Life
                  </button>
                  <button 
                    className="px-2 py-1 bg-gray-700 rounded text-xs"
                    onClick={() => applyRulePreset('dayAndNight')}
                  >
                    Day & Night
                  </button>
                  <button 
                    className="px-2 py-1 bg-gray-700 rounded text-xs"
                    onClick={() => applyRulePreset('seeds')}
                  >
                    Seeds
                  </button>
                  <button 
                    className="px-2 py-1 bg-gray-700 rounded text-xs"
                    onClick={() => applyRulePreset('coral')}
                  >
                    Coral Growth
                  </button>
                  <button 
                    className="px-2 py-1 bg-gray-700 rounded text-xs"
                    onClick={() => applyRulePreset('maze')}
                  >
                    Maze Generator
                  </button>
                  <button 
                    className="px-2 py-1 bg-gray-700 rounded text-xs"
                    onClick={() => applyRulePreset('multicolor')}
                  >
                    Multicolor Life
                  </button>
                </div>
              </div>
              
              {/* Save and Load Rulesets */}
              <div>
                <label className="block text-sm mb-1">Save Custom Ruleset</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={rulesetName}
                    onChange={(e) => setRulesetName(e.target.value)}
                    placeholder="Ruleset name"
                    className="flex-grow px-2 py-1 bg-gray-700 rounded text-sm"
                  />
                  <button
                    onClick={saveCurrentRuleset}
                    className="px-2 py-1 bg-blue-600 rounded text-xs"
                    disabled={!rulesetName.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
              
              {Object.keys(savedRulesets).length > 0 && (
                <div>
                  <label className="block text-sm mb-1">Saved Rulesets</label>
                  <div className="max-h-32 overflow-y-auto">
                    {Object.keys(savedRulesets).map(name => (
                      <div key={name} className="flex items-center justify-between mb-1">
                        <button
                          onClick={() => loadRuleset(name)}
                          className="text-xs text-left hover:text-blue-400"
                        >
                          {name}
                        </button>
                        <button
                          onClick={() => deleteRuleset(name)}
                          className="text-xs text-red-500 hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-3">Appearance</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Background Color</label>
                <input 
                  type="color" 
                  value={colorScheme.background}
                  onChange={(e) => handleColorChange('background', e.target.value)}
                  className="w-full h-8 cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-sm mb-1">Cell Color 1</label>
                <input 
                  type="color" 
                  value={colorScheme.cellColors[0]}
                  onChange={(e) => {
                    const newColors = [...colorScheme.cellColors];
                    newColors[0] = e.target.value;
                    handleColorChange('cellColors', newColors);
                  }}
                  className="w-full h-8 cursor-pointer"
                />
              </div>
              
              {rules.states > 1 && (
                <div>
                  <label className="block text-sm mb-1 flex justify-between">
                    <span>Cell Color 2</span>
                    <button 
                      className="text-gray-400 hover:text-white text-xs"
                      onMouseEnter={() => setShowTooltip('multistate')}
                      onMouseLeave={() => setShowTooltip('')}
                    >
                      ?
                    </button>
                  </label>
                  <input 
                    type="color" 
                    value={colorScheme.cellColors[1]}
                    onChange={(e) => {
                      const newColors = [...colorScheme.cellColors];
                      newColors[1] = e.target.value;
                      handleColorChange('cellColors', newColors);
                    }}
                    className="w-full h-8 cursor-pointer"
                  />
                </div>
              )}
              
              {rules.states > 2 && (
                <div>
                  <label className="block text-sm mb-1">Cell Color 3</label>
                  <input 
                    type="color" 
                    value={colorScheme.cellColors[2]}
                    onChange={(e) => {
                      const newColors = [...colorScheme.cellColors];
                      newColors[2] = e.target.value;
                      handleColorChange('cellColors', newColors);
                    }}
                    className="w-full h-8 cursor-pointer"
                  />
                </div>
              )}
              
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="trail"
                  checked={colorScheme.trailEffect}
                  onChange={(e) => handleColorChange('trailEffect', e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="trail" className="text-sm">Trail Effect</label>
                <button 
                  className="ml-2 text-gray-400 hover:text-white text-xs"
                  onMouseEnter={() => setShowTooltip('trail')}
                  onMouseLeave={() => setShowTooltip('')}
                >
                  ?
                </button>
              </div>
              
              {colorScheme.trailEffect && (
                <div>
                  <label className="block text-sm mb-1">Trail Length</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="10"
                    value={colorScheme.trailLength}
                    onChange={(e) => handleColorChange('trailLength', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-gray-400">{colorScheme.trailLength} generations</div>
                </div>
              )}
              
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="fade"
                  checked={colorScheme.fadeEffect}
                  onChange={(e) => handleColorChange('fadeEffect', e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="fade" className="text-sm">Fade In Effect</label>
                <button 
                  className="ml-2 text-gray-400 hover:text-white text-xs"
                  onMouseEnter={() => setShowTooltip('fade')}
                  onMouseLeave={() => setShowTooltip('')}
                >
                  ?
                </button>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-3">Pattern Seeds</h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.glider)}
              >
                Glider
              </button>
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.pulsar)}
              >
                Pulsar
              </button>
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.gosperGliderGun)}
              >
                Glider Gun
              </button>
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.spaceship)}
              >
                Spaceship
              </button>
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.acorn)}
              >
                Acorn
              </button>
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.flower)}
              >
                Flower
              </button>
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.rpentomino)}
              >
                R-Pentomino
              </button>
              <button 
                className="px-2 py-1 bg-indigo-600 rounded text-xs"
                onClick={() => applyPattern(patterns.diehard)}
              >
                Diehard
              </button>
            </div>
            
            {/* Pattern Import/Export */}
            <div className="flex flex-col space-y-2">
              <button 
                className="px-2 py-1 bg-indigo-700 rounded text-xs w-full"
                onClick={exportCurrentPattern}
              >
                Export Current Pattern
              </button>
              
              <label className="px-2 py-1 bg-indigo-700 rounded text-xs text-center cursor-pointer">
                Import Pattern
                <input 
                  type="file"
                  accept=".json"
                  onChange={importPattern}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          
          <div className="text-xs text-gray-400 mt-4">
            <p>Click and drag on the grid to draw patterns while paused.</p>
            <p className="mt-2">Use mouse wheel to zoom, Ctrl+drag or right-click to pan.</p>
            <p className="mt-2">Tip: Try different rule presets with different patterns for surprising results!</p>
          </div>
        </div>
      </div>
      
      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-20 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Cellular Automata Art Studio - Help</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Basic Controls</h3>
                <ul className="list-disc pl-5 text-sm">
                  <li><strong>Canvas Interaction:</strong> Click and drag to draw patterns when simulation is paused</li>
                  <li><strong>Zoom:</strong> Use mouse wheel to zoom in/out of the grid</li>
                  <li><strong>Pan:</strong> Hold Ctrl or right-click while dragging to move around the grid</li>
                  <li><strong>Play/Pause:</strong> Start or stop the simulation</li>
                  <li><strong>Reset:</strong> Clear the grid and start fresh</li>
                  <li><strong>Random:</strong> Fill the grid with random cells</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold">Understanding Cellular Automata Rules</h3>
                <p className="text-sm mb-2">Cellular automata are based on simple rules that produce complex behaviors:</p>
                <ul className="list-disc pl-5 text-sm">
                  <li><strong>Survive Rules:</strong> A live cell survives if it has between [Min] and [Max] live neighbors</li>
                  <li><strong>Birth Rules:</strong> A dead cell becomes alive if it has between [Min] and [Max] live neighbors</li>
                  <li><strong>Multiple States:</strong> Cells can exist in multiple states (colors) representing different ages or energies</li>
                  <li><strong>Multi-State Birth Rule:</strong> When using multiple states, a new cell's state is determined by the average of its live neighbors' states (rounded to nearest integer)</li>
                  <li><strong>Neighborhood:</strong> Choose between 8 surrounding cells (Moore) or 4 adjacent cells (Von Neumann)</li>
                </ul>
                <p className="text-sm mt-2">Conway's Game of Life uses the survive: 2-3, birth: 3 rule with a single state.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold">Visual Effects</h3>
                <ul className="list-disc pl-5 text-sm">
                  <li><strong>Trail Effect:</strong> Cells leave fading "trails" as they die, creating motion traces</li>
                  <li><strong>Fade Effect:</strong> New cells fade in gradually rather than appearing instantly</li>
                  <li><strong>Multi-state:</strong> Cells change color as they age through multiple states</li>
                  <li><strong>Custom Colors:</strong> Choose colors for cells and background to create different visual moods</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold">Pattern Management</h3>
                <ul className="list-disc pl-5 text-sm">
                  <li><strong>Preset Patterns:</strong> Start with classic patterns like Gliders, Pulsars, etc.</li>
                  <li><strong>Import/Export:</strong> Save your custom patterns and share them with others</li>
                  <li><strong>Save Rulesets:</strong> Create and save your custom rule configurations</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold">Tips for Creating Beautiful Patterns</h3>
                <ul className="list-disc pl-5 text-sm">
                  <li>Try the "Seeds" rule (B2/S) with random initialization for beautiful fractals</li>
                  <li>Use multiple states with trails for creating colorful, flowing patterns</li>
                  <li>Maze generation: B3/S1235 creates maze-like structures</li>
                  <li>Complement complex patterns with contrasting colors</li>
                  <li>Save interesting states when you find them</li>
                </ul>
              </div>
            </div>
            
            <button 
              className="mt-6 px-4 py-2 bg-blue-600 rounded"
              onClick={() => setShowHelp(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CellularAutomataArtStudio;
