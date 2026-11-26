// ZS Quality loudness compensation (equal-loudness contours, ISO 226): the quieter the volume, the more
// bass and air the ear loses, so restore them. The boost stays below the volume cut, so it can never clip.
export function loudnessCompensation(volume: number): { bass: number; treble: number } {
  const cutDb = volume > 0 && volume < 1 ? -40 * Math.log10(volume) : 0 // element gain is volume²
  return { bass: Math.min(9, 0.25 * cutDb), treble: Math.min(3, 0.08 * cutDb) }
}
