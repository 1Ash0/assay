import { Composition } from 'remotion'
import { Film } from './Film'
import T from './timeline.json'

export const Root: React.FC = () => (
  <Composition id="Film" component={Film} durationInFrames={T.frames} fps={T.fps} width={1920} height={1080} />
)
