# visky-api Documentation

This folder contains comprehensive documentation for the visky-api backend service.

## 📚 Available Documentation

### VK API Integration (Core Knowledge Base)

These documents preserve critical knowledge about VK's deprecated Audio API that is no longer available in official documentation:

#### [VK-API-REFERENCE.md](./VK-API-REFERENCE.md) (9.2KB)
**VK Audio API Methods Reference (Quick Overview)**
- Quick reference for VK Audio API methods
- Method categorization and usage status in visky-api
- Code examples from visky-api implementation
- `execute` method for batching requests
- **Status**: Active reference (methods currently used in visky-api)

#### [VK-API-METHODS-DETAILED.md](./VK-API-METHODS-DETAILED.md) (80KB) 🆕
**Complete VK Audio API Methods Documentation**
- **All 21 official VK Audio API methods** with full details
- Complete parameter specifications with types and requirements
- Full request/response examples for each method
- Audio object structure and field descriptions
- Complete audio genres list (22 genres)
- Upload workflow step-by-step guide
- Error codes reference
- **Source**: Official VK API archives (Dec 2016 - Feb 2017)
- **Status**: Complete reference documentation (for service development)

#### [VK-AUTHENTICATION.md](./VK-AUTHENTICATION.md) (12KB)
**Android App Emulation Authentication Flow**
- Step-by-step authentication process
- Android app emulation details (VKAndroidApp/4.13.1-1206)
- Request signing with MD5 signatures
- Session management and security
- Device ID generation algorithm
- Comparison with official OAuth2
- **Status**: Active implementation (how visky-api authenticates)

#### [VK-AUDIO-UNMASK.md](./VK-AUDIO-UNMASK.md) (11KB)
**Audio URL Decryption Algorithm (Historical Reference)**
- VK's audio URL encryption mechanisms
- XOR encryption with track ID (2017 update)
- Evolution of VK's protection over time
- Why visky-api doesn't need URL unmasking
- Legal and security implications
- **Status**: Historical reference only (NOT implemented in visky-api)

### API Specification

#### [openapi.yaml](./openapi.yaml) (1270 lines)
**OpenAPI 3.0 Specification**
- Complete REST API documentation
- Auto-generates TypeScript types for frontend/backend
- Used by Swagger UI for API testing
- **Access**: 
  - Local: `http://localhost:3000/api-docs`
  - Production: `https://visky.envarg.com/api-docs`

---

## 🎯 Quick Links

### For Developers

**Getting Started**:
1. Read [VK-API-METHODS-DETAILED.md](./VK-API-METHODS-DETAILED.md) for complete API methods documentation
2. Check [VK-AUTHENTICATION.md](./VK-AUTHENTICATION.md) to understand auth flow
3. Use [VK-API-REFERENCE.md](./VK-API-REFERENCE.md) for quick reference and code examples
4. Consult [openapi.yaml](./openapi.yaml) for endpoint specifications

**Troubleshooting VK API Issues**:
- API methods documentation → See [VK-API-METHODS-DETAILED.md](./VK-API-METHODS-DETAILED.md) for complete reference
- Authentication failures → See [VK-AUTHENTICATION.md](./VK-AUTHENTICATION.md#troubleshooting)
- API method errors → See [VK-API-REFERENCE.md](./VK-API-REFERENCE.md#error-handling)
- URL decryption questions → See [VK-AUDIO-UNMASK.md](./VK-AUDIO-UNMASK.md) (not needed for visky-api)

### For API Consumers

**Testing Endpoints**:
- Interactive API docs: `https://visky.envarg.com/api-docs`
- OpenAPI spec: [openapi.yaml](./openapi.yaml)

---

## 📖 Documentation Sources

VK API documentation is based on research from:
- [Habr: Тащим музыку из ВК](https://habr.com/ru/articles/340810/) - VK music API reverse engineering
- [Habr: VkPlaylistServer](https://habr.com/ru/articles/250379/) - VK playlist server implementation  
- [VK Audio Token Reference](https://vodka2.github.io/vk-audio-token/) - Archived API documentation
- [VK Official Docs (archived)](https://web.archive.org/web/20170205141608/https://vk.com/dev/audio)
- visky-api source code analysis

---

## ⚠️ Important Notes

### VK Audio API Status
- **Official Status**: ❌ Removed from public VK API documentation
- **visky-api Access**: ✅ Works via Android app emulation
- **Stability**: ⚠️ May break if VK changes authentication or API endpoints
- **Legal**: ⚠️ Using unofficial methods may violate VK Terms of Service

### Security Warnings
- Store credentials securely (never commit to git)
- Use HTTPS in production
- Rotate session secrets regularly
- Implement rate limiting
- See [VK-AUTHENTICATION.md Security Considerations](./VK-AUTHENTICATION.md#security-considerations)

---

## 🔄 Keeping Documentation Updated

### When to Update VK API Docs

- ✅ VK changes authentication flow
- ✅ New VK API methods discovered
- ✅ Error codes change or new ones appear
- ✅ Signature algorithm updates
- ✅ Community discovers new techniques

### How to Contribute

1. Test changes against actual VK API
2. Update relevant `.md` file
3. Add references to sources
4. Update this README if adding new docs
5. Commit with clear description

---

## 📊 Documentation Statistics

| File | Size | Lines | Purpose |
|------|------|-------|---------|
| VK-API-METHODS-DETAILED.md | 80KB | 1100 | Complete API methods reference |
| VK-API-REFERENCE.md | 9.2KB | 344 | Quick API methods overview |
| VK-AUTHENTICATION.md | 12KB | 447 | Auth flow & signing |
| VK-AUDIO-UNMASK.md | 11KB | 392 | URL decryption (historical) |
| openapi.yaml | ~50KB | 1270 | REST API specification |
| **Total VK Docs** | **~162KB** | **3553** | Core knowledge base |

---

## 🔗 Related Documentation

- **Project Root**: [../README.md](../README.md) - Project overview
- **Migration Guide**: [.github/helm/MIGRATION-FRISKY-NAMESPACE.md](../.github/helm/MIGRATION-FRISKY-NAMESPACE.md)
- **Deployment**: [.github/helm/QUICKSTART.md](../.github/helm/QUICKSTART.md)

---

**Last Updated**: December 4, 2025  
**Maintained by**: visky-api contributors  
**License**: See project LICENSE
