/// <reference types="vite/client" />

declare module '@nick/lz4' {
	export function decompress(data: Uint8Array): Uint8Array
}

declare module '*.glsl' {
  const content: string
  export default content
}
declare module '*.vsh' {
  const content: string
  export default content
}
declare module '*.fsh' {
  const content: string
  export default content
}

declare module 'pako' {
  export function inflate(data: Uint8Array): Uint8Array
  export function deflate(data: Uint8Array): Uint8Array
}
