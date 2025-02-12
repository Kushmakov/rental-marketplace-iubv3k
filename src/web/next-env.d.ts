/// <reference types="next" />
/// <reference types="next/types/global" />

// @types/node ^18.0.0
// @types/react ^18.2.0
// @types/react-dom ^18.2.0
// next ^13.0.0

// Augment the NodeJS namespace to include Next.js specific process.env types
declare namespace NodeJS {
  interface ProcessEnv extends NodeJS.ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test'
    readonly NEXT_PUBLIC_API_URL: string
  }
}

// Extend window object with Next.js specific properties
declare interface Window {
  __NEXT_DATA__: any
}

// Define Next.js specific image types
declare module '*.png' {
  const content: string
  export default content
}

declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.svg' {
  const content: React.FC<React.SVGProps<SVGSVGElement>>
  export default content
}

// Next.js component type definitions
declare type NextComponentType<
  C extends BaseContext = NextPageContext,
  IP = {},
  P = {}
> = React.ComponentType<P> & {
  getInitialProps?(context: C): IP | Promise<IP>
}

// Next.js page context interface
declare interface NextPageContext {
  req?: IncomingMessage & {
    cookies: { [key: string]: string }
  }
  res?: ServerResponse
  pathname: string
  query: ParsedUrlQuery
  asPath?: string
  AppTree: NextComponentType
  err?: Error
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

// Next.js document context interface
declare interface DocumentContext extends NextPageContext {
  renderPage: DocumentRenderPage
  defaultGetInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps>
}

// Next.js router type definitions
declare interface TransitionOptions {
  shallow?: boolean
  locale?: string | false
  scroll?: boolean
}

declare type Url = UrlObject | string

declare interface RouterEvent {
  routeChangeStart?: (url: string) => void
  routeChangeComplete?: (url: string) => void
  routeChangeError?: (err: Error, url: string) => void
  beforeHistoryChange?: (url: string) => void
  hashChangeStart?: (url: string) => void
  hashChangeComplete?: (url: string) => void
}

// Next.js data fetching type definitions
declare interface GetStaticPropsContext<
  Q extends ParsedUrlQuery = ParsedUrlQuery,
  D extends PreviewData = PreviewData
> {
  params?: Q
  preview?: boolean
  previewData?: D
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

declare interface GetServerSidePropsContext<
  Q extends ParsedUrlQuery = ParsedUrlQuery,
  D extends PreviewData = PreviewData
> {
  req: IncomingMessage & {
    cookies: { [key: string]: string }
  }
  res: ServerResponse
  params?: Q
  query: ParsedUrlQuery
  preview?: boolean
  previewData?: D
  resolvedUrl: string
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

// Next.js API route type definitions
declare type NextApiHandler<T = any> = (
  req: NextApiRequest,
  res: NextApiResponse<T>
) => void | Promise<void>

declare interface NextApiRequest extends IncomingMessage {
  query: {
    [key: string]: string | string[]
  }
  cookies: {
    [key: string]: string
  }
  body: any
  env: {
    [key: string]: string
  }
  preview?: boolean
  previewData?: any
}

declare interface NextApiResponse<T = any> extends ServerResponse {
  send: (body: T) => void
  json: (body: T) => void
  status: (statusCode: number) => NextApiResponse<T>
  redirect(url: string): NextApiResponse<T>
  redirect(status: number, url: string): NextApiResponse<T>
}