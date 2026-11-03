import { Composition, Still } from 'remotion'
import { Film } from './Film'
import { Thumb } from './Thumb'
import T from './timeline.json'

export const Root: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={T.frames} fps={T.fps} width={1920} height={1080} />
    <Still id="Thumb" component={Thumb} width={1920} height={1080} />
  </>
)
