import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  PanOnScrollMode,
  ReactFlow,
  type ReactFlowProps,
  SelectionMode
} from "@xyflow/react"

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

/**
 * How a canvas looks is the application's own: it imports one of the presets, `flow` (React Flow
 * as it comes) or `nyssance`, or its own stylesheet, and may name the preset here to scope it.
 */
export type CanvasPreset = "flow" | "nyssance"

function presetClass(preset: CanvasPreset | undefined, className: string | undefined): string | undefined {
  return [preset && `metro-${preset}`, className].filter(Boolean).join(" ") || undefined
}

/** Native React Flow gestures with an optional themed dot grid. */
export function FlowCanvas<N extends Node = Node, E extends Edge = Edge>({
  children,
  backgroundSize,
  showBackground = true,
  preset,
  className,
  ...props
}: ReactFlowProps<N, E> & { backgroundSize?: number; showBackground?: boolean; preset?: CanvasPreset }) {
  return (
    <ReactFlow<N, E> {...props} className={presetClass(preset, className)}>
      {showBackground && <Background variant={BackgroundVariant.Dots} size={backgroundSize} />}
      {children}
    </ReactFlow>
  )
}

/** The shared canvas gestures: drag to select, scroll to pan, pinch to zoom, middle or right drag to pan. */
export function WorkCanvas<N extends Node = Node, E extends Edge = Edge>(
  props: ReactFlowProps<N, E> & { preset?: CanvasPreset }
) {
  return (
    <FlowCanvas<N, E>
      showBackground={false}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      panOnDrag={[1, 2]}
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      selectNodesOnDrag
      multiSelectionKeyCode={null}
      panOnScroll
      panOnScrollSpeed={1.2}
      panOnScrollMode={PanOnScrollMode.Free}
      zoomOnScroll={false}
      zoomOnPinch
      zoomOnDoubleClick={false}
      autoPanOnConnect
      autoPanOnNodeDrag
      autoPanSpeed={15}
      elevateNodesOnSelect
      elevateEdgesOnSelect={false}
      deleteKeyCode={["Backspace", "Delete"]}
      fitView={!props.defaultViewport && !props.viewport}
      fitViewOptions={{ minZoom: 0.7, maxZoom: 1.3 }}
      {...props}
    />
  )
}

/** The modifier key a shortcut hint should show on this platform. */
export function modifierLabel(platform = navigator.platform): string {
  return /Mac|iPhone|iPad/.test(platform) ? "⌘" : "Ctrl"
}

/** Whether a key event belongs to a field being typed in, so canvas shortcuts must leave it alone. */
export function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]'
      ))
  )
}
