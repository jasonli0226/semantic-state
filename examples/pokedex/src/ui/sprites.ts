/** Sprites are © Nintendo / Game Freak, served by the PokeAPI sprites repo. The only network images on the page. */
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

export const spriteUrl = (id: number) => `${SPRITES}/${id}.png`
export const artworkUrl = (id: number) => `${SPRITES}/other/official-artwork/${id}.png`
export const dexNumber = (id: number) => `#${String(id).padStart(4, '0')}`
