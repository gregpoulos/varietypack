// The UI side of model/kinds STRUCTURED: { [kind]: { Editor, SizePreview?, Settings? } }.
// Kept apart from the model so kinds/index.js stays pure code. Each kind registers here.
import { SpiralEditor } from './SpiralEditor.jsx';
import { SnakeCharmerEditor } from './SnakeCharmerEditor.jsx';
import { SnakeCharmerSizePreview } from './SnakeCharmerSizePreview.jsx';
import { MarchingBandsEditor } from './MarchingBandsEditor.jsx';
import { MarchingBandsSizePreview } from './MarchingBandsSizePreview.jsx';
import { MarchingBandsSettings } from './MarchingBandsSettings.jsx';
import { CrushwordEditor } from './CrushwordEditor.jsx';
import { CrushwordSizePreview } from './CrushwordSizePreview.jsx';
import { CrushwordSettings } from './CrushwordSettings.jsx';

export const EDITORS = {
  spiral: { Editor: SpiralEditor },
  'snake-charmer': { Editor: SnakeCharmerEditor, SizePreview: SnakeCharmerSizePreview },
  'marching-bands': { Editor: MarchingBandsEditor, SizePreview: MarchingBandsSizePreview, Settings: MarchingBandsSettings },
  crushword: { Editor: CrushwordEditor, SizePreview: CrushwordSizePreview, Settings: CrushwordSettings },
};
