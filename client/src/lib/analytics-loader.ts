declare global {
  interface Window {
    dataLayer: IArguments[];
    gtag: (...args: unknown[]) => void;
  }
}

const GA_ID = 'G-0BKZXTSHXH';
let loaded = false;

function loadGA() {
  if (loaded) return;
  loaded = true;

  const script = document.createElement('script');
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  script.async = true;
  document.head.appendChild(script);

  script.onload = () => {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  };
}

export function initAnalytics() {
  const events = ['mousedown', 'touchstart', 'scroll', 'keydown'] as const;
  events.forEach((ev) =>
    document.addEventListener(ev, loadGA, { once: true, passive: true }),
  );
  setTimeout(loadGA, 3000);
}
