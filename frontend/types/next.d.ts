declare module 'next' {
  export interface Metadata {
    title?: string | { default: string; template?: string };
    description?: string;
    [key: string]: any;
  }
}

declare module 'next/dist/lib/metadata/types/metadata-interface.js' {
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
}

declare module 'next/types.js' {
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
}

declare module 'next/dist/build/segment-config/app/app-segment-config.js' {
  export type InstantConfigForTypeCheckInternal = any;
  export type Prefetch = any;
}

declare module 'next/link';
declare module 'next/navigation';
declare module 'next/dynamic';
