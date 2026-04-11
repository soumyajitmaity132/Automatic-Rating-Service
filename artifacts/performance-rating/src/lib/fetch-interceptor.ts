// Intercept all native fetch calls to inject the Authorization header
export function setupFetchInterceptor() {
  const originalFetch = window.fetch;
  
  window.fetch = async (...args) => {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';
    
    if (url.startsWith('/api') || url.includes('/api/')) {
      const token = localStorage.getItem('token');
      if (token) {
        const newConfig = { ...(config || {}) };
        const headers = new Headers(resource instanceof Request ? resource.headers : undefined);

        if (config?.headers) {
          new Headers(config.headers).forEach((value, key) => {
            headers.set(key, value);
          });
        }

        headers.set('Authorization', `Bearer ${token}`);
        newConfig.headers = headers;
        return originalFetch(resource, newConfig);
      }
    }
    
    return originalFetch(...args);
  };
}
