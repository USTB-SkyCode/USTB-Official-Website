declare module 'pako' {
  export function inflate(data: Uint8Array): Uint8Array
  export function ungzip(data: Uint8Array): Uint8Array
}

declare module '*.glsl' {
  const src: string
  export default src
}

declare module '*.vsh' {
  const src: string
  export default src
}

declare module '*.fsh' {
  const src: string
  export default src
}

declare module '*.vert' {
  const src: string
  export default src
}

declare module '*.frag' {
  const src: string
  export default src
}

declare module '*.wgsl' {
  const src: string
  export default src
}
