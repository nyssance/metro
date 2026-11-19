/** The grid tidy layouts and grid-snapped moves land on. */
export const SNAP_GRID_SIZE = 12

export function snapCoordinate(value: number): number {
  return Math.round(value / SNAP_GRID_SIZE) * SNAP_GRID_SIZE
}

export function snapPosition(position: { x: number; y: number }): { x: number; y: number } {
  return { x: snapCoordinate(position.x), y: snapCoordinate(position.y) }
}
