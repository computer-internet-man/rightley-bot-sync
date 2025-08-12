import { PerformanceTracker } from '../lib/logger';

/**
 * WAF rule interface
 */
interface WAFRule {
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  block: boolean;
}

/**
 * WAF configuration interface
 */
interface WAFConfig {
  enableSQLInjection: boolean;
  enableXSS: boolean;
  enablePathTraversal: boolean;
  enableCommandInjection: boolean;
  enableBotDetection: boolean;
  enableGeoBlocking: boolean;
  blockedCountries: string[];
  trustedUserAgents: string[];
  suspiciousUserAgents: string[];
}

/**
 * WAF detection result
 */
interface WAFResult {
  blocked: boolean;
  rules: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
}

/**
 * Web Application Firewall implementation
 */
export class WAF {
  private rules: WAFRule[];
  private config: WAFConfig;
  private blocklist: KVNamespace;

  constructor(config: WAFConfig, blocklist: KVNamespace) {
    this.config = config;
    this.blocklist = blocklist;
    this.rules = this.initializeRules();
  }

  private initializeRules(): WAFRule[] {
    const rules: WAFRule[] = [];

    // SQL Injection patterns
    if (this.config.enableSQLInjection) {
      rules.push(
        {
          name: 'sql_injection_union',
          pattern: /\b(union|UNION)\s+(all\s+)?(select|SELECT)\b/gi,
          severity: 'critical',
          description: 'SQL injection attempt using UNION SELECT',
          block: true
        },
        {
          name: 'sql_injection_comments',
          pattern: /(\/\*.*?\*\/|--|\#|;)/g,
          severity: 'high',
          description: 'SQL injection attempt using comments or semicolons',
          block: true
        },
        {
          name: 'sql_injection_functions',
          pattern: /\b(exec|execute|sp_executesql|xp_cmdshell|eval|concat|char|ascii)\s*\(/gi,
          severity: 'critical',
          description: 'SQL injection attempt using dangerous functions',
          block: true
        },
        {
          name: 'sql_injection_keywords',
          pattern: /\b(drop|delete|insert|update|alter|create|truncate|replace)\s+(table|database|schema|index)\b/gi,
          severity: 'critical',
          description: 'SQL injection attempt using DDL/DML keywords',
          block: true
        }
      );
    }

    // XSS patterns
    if (this.config.enableXSS) {
      rules.push(
        {
          name: 'xss_script_tags',
          pattern: /<\s*script[^>]*>.*?<\/\s*script\s*>/gis,
          severity: 'high',
          description: 'XSS attempt using script tags',
          block: true
        },
        {
          name: 'xss_javascript_protocol',
          pattern: /javascript\s*:/gi,
          severity: 'medium',
          description: 'XSS attempt using javascript protocol',
          block: true
        },
        {
          name: 'xss_event_handlers',
          pattern: /\bon(load|error|click|mouseover|focus|blur|change|submit)\s*=/gi,
          severity: 'medium',
          description: 'XSS attempt using event handlers',
          block: true
        },
        {
          name: 'xss_html_entities',
          pattern: /&\#(x)?[0-9a-f]+;?/gi,
          severity: 'low',
          description: 'Potential XSS using HTML entities',
          block: false
        }
      );
    }

    // Path traversal patterns
    if (this.config.enablePathTraversal) {
      rules.push(
        {
          name: 'path_traversal_dots',
          pattern: /\.\.[\/\\]/g,
          severity: 'high',
          description: 'Path traversal attempt using dot notation',
          block: true
        },
        {
          name: 'path_traversal_encoded',
          pattern: /(%2e%2e[%2f%5c]|\.\.[\/%5c]|%2e%2e\/)/gi,
          severity: 'high',
          description: 'Path traversal attempt using encoded characters',
          block: true
        },
        {
          name: 'path_traversal_absolute',
          pattern: /(\/etc\/passwd|\/etc\/shadow|\.\.\/\.\.\/|\\..\\..\\)/gi,
          severity: 'critical',
          description: 'Path traversal attempt targeting system files',
          block: true
        }
      );
    }

    // Command injection patterns
    if (this.config.enableCommandInjection) {
      rules.push(
        {
          name: 'command_injection_pipes',
          pattern: /[;&|`$(){}]/g,
          severity: 'high',
          description: 'Command injection attempt using shell metacharacters',
          block: true
        },
        {
          name: 'command_injection_commands',
          pattern: /\b(cat|ls|pwd|id|whoami|uname|netstat|ps|kill|chmod|chown|sudo|su|wget|curl|nc|ncat|telnet|ssh|ftp)\b/gi,
          severity: 'medium',
          description: 'Command injection attempt using system commands',
          block: false
        }
      );
    }

    return rules;
  }

  /**
   * Check if request is from a blocked country
   */
  private checkGeoBlocking(request: Request): boolean {
    if (!this.config.enableGeoBlocking || this.config.blockedCountries.length === 0) {
      return false;
    }

    const country = request.headers.get('CF-IPCountry');
    return country ? this.config.blockedCountries.includes(country.toUpperCase()) : false;
  }

  /**
   * Check User-Agent for bot detection
   */
  private checkUserAgent(userAgent: string | null): { suspicious: boolean; reason: string } {
    if (!userAgent) {
      return { suspicious: true, reason: 'Missing User-Agent header' };
    }

    // Check against trusted user agents
    if (this.config.trustedUserAgents.some(trusted => userAgent.includes(trusted))) {
      return { suspicious: false, reason: '' };
    }

    // Check against suspicious user agents
    const suspiciousPattern = this.config.suspiciousUserAgents.find(pattern => 
      userAgent.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (suspiciousPattern) {
      return { suspicious: true, reason: `Suspicious User-Agent: ${suspiciousPattern}` };
    }

    // Basic bot detection patterns
    const botPatterns = [
      /curl/i, /wget/i, /python/i, /perl/i, /java/i, /go-http-client/i,
      /bot/i, /crawler/i, /spider/i, /scraper/i, /scanner/i
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        return { suspicious: true, reason: `Bot-like User-Agent detected: ${pattern.source}` };
      }
    }

    return { suspicious: false, reason: '' };
  }

  /**
   * Check if IP is in blocklist
   */
  async checkIPBlocklist(ip: string): Promise<boolean> {
    const key = `blocklist:ip:${ip}`;
    const blocked = await this.blocklist.get(key);
    return blocked !== null;
  }

  /**
   * Add IP to blocklist
   */
  async addToBlocklist(ip: string, reason: string, durationMinutes = 60): Promise<void> {
    const key = `blocklist:ip:${ip}`;
    await this.blocklist.put(key, JSON.stringify({
      reason,
      blocked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
    }), {
      expirationTtl: durationMinutes * 60
    });
  }

  /**
   * Analyze request for security threats
   */
  async analyzeRequest(request: Request): Promise<WAFResult> {
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent');
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Check geo-blocking
    if (this.checkGeoBlocking(request)) {
      return {
        blocked: true,
        rules: ['geo_blocking'],
        severity: 'medium',
        reason: `Request from blocked country: ${request.headers.get('CF-IPCountry')}`
      };
    }

    // Check IP blocklist
    if (await this.checkIPBlocklist(clientIP)) {
      return {
        blocked: true,
        rules: ['ip_blocklist'],
        severity: 'high',
        reason: 'IP address is in blocklist'
      };
    }

    // Check User-Agent
    if (this.config.enableBotDetection) {
      const uaCheck = this.checkUserAgent(userAgent);
      if (uaCheck.suspicious) {
        return {
          blocked: false, // Log but don't block for now
          rules: ['suspicious_user_agent'],
          severity: 'low',
          reason: uaCheck.reason
        };
      }
    }

    // Get request body for POST/PUT requests
    let body = '';
    if (request.method === 'POST' || request.method === 'PUT') {
      try {
        body = await request.clone().text();
      } catch (error) {
        // Ignore body parsing errors
      }
    }

    // Combine URL, query parameters, and body for analysis
    const analysisText = `${url.pathname} ${url.search} ${body}`.toLowerCase();

    // Check against WAF rules
    const matchedRules: string[] = [];
    let highestSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let shouldBlock = false;

    for (const rule of this.rules) {
      if (rule.pattern.test(analysisText)) {
        matchedRules.push(rule.name);
        
        // Update highest severity
        const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
        if (severityLevels[rule.severity] > severityLevels[highestSeverity]) {
          highestSeverity = rule.severity;
        }

        if (rule.block) {
          shouldBlock = true;
        }
      }
    }

    return {
      blocked: shouldBlock,
      rules: matchedRules,
      severity: highestSeverity,
      reason: matchedRules.length > 0 
        ? `Security rule violation: ${matchedRules.join(', ')}`
        : 'Request passed WAF analysis'
    };
  }
}

/**
 * WAF middleware factory
 */
export function createWAFMiddleware(env: any) {
  const config: WAFConfig = {
    enableSQLInjection: env.SECURITY_ENABLE_WAF === 'true',
    enableXSS: env.SECURITY_ENABLE_WAF === 'true',
    enablePathTraversal: env.SECURITY_ENABLE_WAF === 'true',
    enableCommandInjection: env.SECURITY_ENABLE_WAF === 'true',
    enableBotDetection: env.SECURITY_ENABLE_WAF === 'true',
    enableGeoBlocking: env.SECURITY_ENABLE_GEO_BLOCKING === 'true',
    blockedCountries: env.SECURITY_BLOCKED_COUNTRIES ? 
      env.SECURITY_BLOCKED_COUNTRIES.split(',').map((c: string) => c.trim().toUpperCase()) : [],
    trustedUserAgents: [
      'Mozilla/', 'Chrome/', 'Safari/', 'Edge/', 'Firefox/',
      'Googlebot', 'Bingbot', 'Slackbot', 'facebookexternalhit'
    ],
    suspiciousUserAgents: [
      'sqlmap', 'nmap', 'nikto', 'w3af', 'masscan', 'nessus',
      'openvas', 'burpsuite', 'owasp', 'paros', 'webscarab'
    ]
  };

  const waf = new WAF(config, env.SECURITY_BLOCKLIST);

  return async function wafMiddleware(request: Request): Promise<Response | null> {
    const perf = PerformanceTracker.getInstance();
    const timer = perf.startTimer('waf_analysis', 'middleware');

    try {
      const result = await waf.analyzeRequest(request);

      // Log security events to Sentry
      if (result.rules.length > 0) {
        if (typeof Sentry !== 'undefined') {
          console.warn('WAF security rule triggered', {
            level: result.blocked ? 'error' : 'warning',
            tags: {
              security_event: 'waf_rule_triggered',
              severity: result.severity,
              blocked: result.blocked.toString()
            },
            extra: {
              rules: result.rules,
              reason: result.reason,
              url: request.url,
              method: request.method,
              user_agent: request.headers.get('User-Agent'),
              client_ip: request.headers.get('CF-Connecting-IP')
            }
          });
        }
      }

      perf.endTimer(timer);

      if (result.blocked) {
        // Auto-block repeat offenders
        const clientIP = request.headers.get('CF-Connecting-IP');
        if (clientIP && result.severity === 'critical') {
          await waf.addToBlocklist(clientIP, result.reason, 30); // Block for 30 minutes
        }

        return new Response('Request blocked by security policy', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
            'X-Security-Block-Reason': result.reason,
            'X-Security-Rules': result.rules.join(',')
          }
        });
      }

      // Store WAF result for logging
      (request as any).wafResult = result;
      
      return null; // Allow request to continue
    } catch (error) {
      perf.endTimer(timer);
      console.error('WAF middleware error:', error);
      return null; // On error, allow request to continue
    }
  };
}
