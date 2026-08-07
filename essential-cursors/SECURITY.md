# Security Policy

## Reporting a Vulnerability

We take the security of Essential Cursor seriously. If you believe you have found a security vulnerability, please report it to us using **GitHub Security Advisories**.

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

1. Go to the [Security](../../security/advisories) tab of this repository
2. Click "Report a vulnerability"
3. Provide a detailed description of the issue, including:
   - Steps to reproduce
   - Potential impact
   - Any relevant code snippets or screenshots

### Response Time

We aim to respond to all security reports within **72 hours**. After our initial response, we will keep you informed of our progress toward fixing and publishing the vulnerability.

### Security Notes

- **Zero runtime dependencies**: Essential Cursor has zero dependencies de runtime, resulting in a minimal attack surface.
- **Pure CSS**: The library is distributed as pure CSS with embedded SVG data URIs—no JavaScript execution required.
- **Supply chain protection**: We use npm provenance (`publishConfig.provenance: true`) to ensure package integrity.

### Preferred Languages

We prefer all communications to be in English or Portuguese.
