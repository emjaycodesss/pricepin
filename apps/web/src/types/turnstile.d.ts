/**
 * Cloudflare Turnstile client-side API (loaded via script tag, render=explicit).
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark';
          size?: 'normal' | 'compact';
          /** Called when widget fails (e.g. 110200, blocked). We use it to allow scan without token. */
          'error-callback'?: () => void;
        }
      ) => string;
      getResponse: (widgetId: string) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export {};
