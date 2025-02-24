# GameOfLife
GameOfLife
# Cellular Automata Art Studio

A React component for creating and exploring cellular automata art with customizable rules, multiple states, and interactive features. This component allows users to design evolving patterns, experiment with different rulesets, and create visually stunning simulations.

## Features

- **Customizable Rules**: Define survival and birth conditions for cells.  
- **Multiple Cell States**: Support for up to 5 different states with unique colors.  
- **Neighborhood Types**: Choose between Moore (8 cells) and Von Neumann (4 cells) neighborhoods.  
- **Edge Wrapping**: Option to wrap the grid edges for continuous patterns.  
- **Visual Effects**: Enable trail and fade-in effects for enhanced visuals.  
- **Interactive Canvas**: Draw patterns manually, zoom, and pan for detailed exploration.  
- **Predefined Patterns and Rules**: Start with classic patterns and rule presets.  
- **Save and Load Rulesets**: Store custom configurations for later use.  
- **Import and Export Patterns**: Share or reuse patterns via JSON files.  
- **Optimized Performance**: Uses a web worker for computation and efficient rendering.  

## Integration

To use this component in your React project:

1. Ensure you have React and ReactDOM installed.  
2. Copy the `CellularAutomataArtStudio` component code into a new file, e.g., `CellularAutomataArtStudio.js`.  
3. Import and render the component in your app:  

   ```jsx
   import React from 'react';
   import CellularAutomataArtStudio from './CellularAutomataArtStudio';

   function App() {
     return (
       <div>
         <CellularAutomataArtStudio />
       </div>
     );
   }

   export default App;
   ```

4. Include any necessary dependencies, such as `lucide-react` for icons.  

## Usage

### Controls

- **Play/Pause**: Start or stop the simulation.  
- **Reset**: Clear the grid and reset the simulation.  
- **Random**: Fill the grid with random cells.  
- **Save Image**: Download the current canvas as a PNG image.  
- **Reset View**: Reset zoom and pan to default.  
- **Help**: Open a modal with detailed instructions and tips.  

### Interaction

- **Drawing**: Click and drag on the canvas to draw or erase patterns (when the simulation is paused).  
- **Zoom**: Use the mouse wheel to zoom in and out.  
- **Pan**: Hold `Ctrl` or right-click and drag to pan the canvas.  

### Settings

#### Rule Settings

- **Survive Min-Max**: Range of neighbors for a live cell to survive.  
- **Birth Min-Max**: Range of neighbors for a dead cell to become alive.  
- **Cell States**: Number of states (1-5) for multi-state automata.  
- **Neighborhood**: Select Moore (8 cells) or Von Neumann (4 cells).  
- **Edge Wrapping**: Toggle to enable grid wrapping at the edges.  

#### Appearance

- **Background Color**: Set the canvas background color.  
- **Cell Colors**: Customize colors for each cell state.  
- **Trail Effect**: Enable fading trails for dying cells.  
- **Fade Effect**: Enable gradual fade-in for new cells.  

### Patterns and Presets

- **Predefined Patterns**: Apply classic patterns like Glider, Pulsar, and more.  
- **Rule Presets**: Use presets such as Game of Life, Seeds, and Maze.  
- **Custom Rulesets**: Save and load your own ruleset configurations.  

## Examples

- **Classic Game of Life**:  
  - Select the "Game of Life" preset.  
  - Apply the "Glider" pattern and start the simulation to observe its movement.  

- **Multi-State Art**:  
  - Set "Cell States" to 3 or more.  
  - Enable "Trail Effect" for dynamic, colorful patterns.  
  - Use "Random" fill and adjust the speed for evolving art.  

- **Maze Generation**:  
  - Select the "Maze" preset (Survive: 1-5, Birth: 3).  
  - Use "Random" fill to generate maze-like structures.  

## Performance Considerations

- The simulation uses a web worker for computation, ensuring the UI remains responsive.  
- Rendering is optimized to redraw only changed cells when possible.  
- For very large grids or high zoom levels, performance may vary based on device capabilities.  

## Customization

Advanced users can modify the component's code to customize initial settings or add new features:  

- Adjust the default grid size by changing the `gridSize` state.  
- Add new patterns to the `patterns` object.  
- Implement additional rule types or visual effects.  

Ensure to handle any changes carefully to maintain performance and functionality.  

## Contributing

Contributions are welcome! Please submit issues or pull requests on the project's repository.  

## License

This project is licensed under the MIT License.
