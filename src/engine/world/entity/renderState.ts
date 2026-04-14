export interface EntityRenderState {
  id: number
  transform: Float32Array
  bounds: {
    min: Float32Array
    max: Float32Array
  }
  modelPosition: Float32Array
  mainViewVisible: boolean
  castShadow: boolean
  receiveShadow: boolean
  doubleSided: boolean
}
