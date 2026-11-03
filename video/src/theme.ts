// The site's dark Phosphor tokens (web/prototype/theme.css), one meaning per
// colour: verm = capture failure, ochre = warning, mint = verified, cob = data.
import { loadFont as chakra } from '@remotion/google-fonts/ChakraPetch'
import { loadFont as plex } from '@remotion/google-fonts/IBMPlexSans'
import { loadFont as jet } from '@remotion/google-fonts/JetBrainsMono'

export const C = {
  ground: '#0C0B09', paper: '#15130F', paper2: '#1B1914', ink: '#ECE5D3', ink2: '#C7BFAC', mute: '#958D7C', rule: '#2E2A22',
  verm: '#FF5B3A', cob: '#73D3DF', ochre: '#F0A63A', mint: '#A9E06A', u: '#9C95E6',
}
export const F = {
  display: `${chakra('normal', { weights: ['600', '700'], subsets: ['latin'] }).fontFamily}, sans-serif`,
  body: `${plex('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily}, sans-serif`,
  mono: `${jet('normal', { weights: ['400', '500', '700'], subsets: ['latin'] }).fontFamily}, monospace`,
}
export const W = 1920, H = 1080
