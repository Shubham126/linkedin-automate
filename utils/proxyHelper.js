import dotenv from 'dotenv';

dotenv.config();

/**
 * Get proxy configuration
 * Supports both old format (separate HOST/PORT) and new format (PROXY_SERVER URL)
 */
export function getProxyConfig() {
  // New format: PROXY_SERVER URL (e.g., socks5://user:pass@host:port)
  const proxyServer = process.env.PROXY_SERVER;
  const useProxy = process.env.USE_PROXY === 'true';

  // Old format: Separate HOST/PORT
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  const proxyUsername = process.env.PROXY_USERNAME;
  const proxyPassword = process.env.PROXY_PASSWORD;

  // If explicitly disabled or no config provided
  if (useProxy === false || (!proxyServer && !proxyHost)) {
    console.log('ℹ️  No proxy configured, using direct connection');
    return null;
  }

  // If PROXY_SERVER URL is provided (new format)
  if (proxyServer) {
    try {
      const proxyUrl = new URL(proxyServer);
      const sanitized = proxyServer.replace(/\/\/.*:.*@/, '//*****:*****@');
      
      console.log('🔒 Proxy: Enabled (URL format)');
      console.log(`   Server: ${sanitized}`);
      console.log(`   Protocol: ${proxyUrl.protocol.replace(':', '')}`);
      
      return {
        server: proxyServer,
        protocol: proxyUrl.protocol.replace(':', ''),
        host: proxyUrl.hostname,
        port: proxyUrl.port,
        username: decodeURIComponent(proxyUrl.username || ''),
        password: decodeURIComponent(proxyUrl.password || ''),
        bypass: '<-loopback>'
      };
    } catch (error) {
      console.error('❌ Invalid PROXY_SERVER URL format:', error.message);
      return null;
    }
  }

  // Old format: Build from separate components
  if (proxyHost && proxyPort) {
    const hasAuth = proxyUsername && proxyPassword;
    const protocol = 'http'; // Default to HTTP for old format
    
    let serverUrl = `${protocol}://`;
    if (hasAuth) {
      serverUrl += `${encodeURIComponent(proxyUsername)}:${encodeURIComponent(proxyPassword)}@`;
    }
    serverUrl += `${proxyHost}:${proxyPort}`;
    
    console.log('🔒 Proxy: Enabled (legacy format)');
    console.log(`   Server: ${proxyHost}:${proxyPort}`);
    console.log(`   Auth: ${hasAuth ? 'Yes' : 'No'}`);
    
    return {
      server: serverUrl,
      protocol: protocol,
      host: proxyHost,
      port: proxyPort,
      username: proxyUsername || '',
      password: proxyPassword || '',
      bypass: '<-loopback>'
    };
  }

  console.log('ℹ️  No valid proxy configuration found');
  return null;
}

/**
 * Get proxy arguments for Puppeteer
 */
export function getProxyArgs() {
  const proxyConfig = getProxyConfig();
  
  if (!proxyConfig) {
    return [];
  }

  const args = [];

  // Handle different proxy protocols
  if (proxyConfig.protocol === 'socks5' || proxyConfig.protocol === 'socks5h') {
    // SOCKS5 proxy format
    args.push(`--proxy-server=socks5://${proxyConfig.host}:${proxyConfig.port}`);
  } else if (proxyConfig.protocol === 'socks4') {
    // SOCKS4 proxy format
    args.push(`--proxy-server=socks4://${proxyConfig.host}:${proxyConfig.port}`);
  } else {
    // HTTP/HTTPS proxy format (default)
    args.push(`--proxy-server=${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`);
  }

  return args;
}

/**
 * Authenticate proxy if credentials are provided
 */
export async function authenticateProxy(page) {
  const proxyConfig = getProxyConfig();
  
  if (!proxyConfig) {
    return;
  }

  try {
    // Only authenticate if credentials exist
    if (proxyConfig.username && proxyConfig.password) {
      console.log('🔐 Authenticating with proxy...');
      
      // Note: SOCKS5 with authentication is not supported by Chrome/Puppeteer
      if (proxyConfig.protocol === 'socks5' || proxyConfig.protocol === 'socks4') {
        console.warn('⚠️  Warning: SOCKS proxies with authentication are not fully supported by Chromium');
        console.warn('   Consider using HTTP proxy or SOCKS without authentication');
      }
      
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password
      });
      
      console.log('✅ Proxy authentication successful');
    } else {
      console.log('ℹ️  Proxy has no authentication');
    }
  } catch (error) {
    console.error('⚠️ Proxy authentication error:', error.message);
    throw error;
  }
}

/**
 * Test proxy connection with retry logic
 */
export async function testProxyConnection(page, maxRetries = 2) {
  const proxyConfig = getProxyConfig();
  
  if (!proxyConfig) {
    console.log('ℹ️  Skipping proxy test (no proxy configured)');
    return true;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🧪 Testing proxy connection (attempt ${attempt}/${maxRetries})...`);
      
      const response = await page.goto('https://api.ipify.org?format=json', {
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      const content = await page.content();
      const ipMatch = content.match(/"ip":"([^"]+)"/);
      
      if (ipMatch) {
        console.log(`✅ Proxy working! Your IP: ${ipMatch[1]}`);
        return true;
      }

      console.log('⚠️ Could not verify proxy IP');
      return false;
    } catch (error) {
      console.error(`❌ Proxy test failed (attempt ${attempt}):`, error.message);
      
      if (attempt === maxRetries) {
        console.error('❌ All proxy test attempts failed');
        return false;
      }
      
      // Wait before retry
      console.log('⏳ Waiting 3 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  return false;
}

/**
 * Validate proxy configuration
 */
export function validateProxyConfig() {
  const proxyConfig = getProxyConfig();
  
  if (!proxyConfig) {
    return { valid: true, message: 'No proxy configured' };
  }

  // Check for SOCKS with auth (not supported)
  if ((proxyConfig.protocol === 'socks5' || proxyConfig.protocol === 'socks4') && 
      proxyConfig.username && proxyConfig.password) {
    return { 
      valid: false, 
      message: 'SOCKS proxies with authentication are not supported by Chromium. Use HTTP proxy instead.' 
    };
  }

  return { valid: true, message: 'Proxy configuration is valid' };
}
