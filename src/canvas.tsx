import {
  type Edge,
  type Node,
  PanOnScrollMode,
  ReactFlow,
  type ReactFlowProps,
  SelectionMode
} from "@xyflow/react"
import "@xyflow/react/style.css"

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

/** A work view owns its objects, relations, renderers and saved viewport. */
export function WorkCanvas<N extends Node = Node, E extends Edge = Edge>(props: ReactFlowProps<N, E>) {
  return (
    <ReactFlow<N, E>
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
