export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

export function trackLogin(provider: string, success: boolean) {
  trackEvent('login', { provider, success });
}

export function trackCheckoutStart(plan: 'monthly' | 'yearly') {
  trackEvent('begin_checkout', { plan });
}

export function trackCheckoutComplete(plan: 'monthly' | 'yearly') {
  trackEvent('purchase', { plan });
}

export function trackPremiumGateOverlay(type: 'daily' | 'weekly') {
  trackEvent('premium_gate_shown', { type });
}

export function trackUpgradeClick(source: string) {
  trackEvent('upgrade_clicked', { source });
}

export function trackContactSubmit(success: boolean) {
  trackEvent('contact_submitted', { success });
}
