# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ThinLine Radio is an Angular 21 radio scanner platform built on the foundation of [Rdio Scanner](https://github.com/chuot/rdio-scanner). It provides real-time audio streaming of police/fire/EMS scanner traffic with enterprise features including user authentication, multi-tenancy, billing, transcription services, and advanced alerting.

## Development Commands

### Development Server
```bash
pnpm start
# Runs dev server on http://localhost:3000
# Proxies API requests to http://192.168.6.67:3000 (see src/proxy.conf.js)
# WebSocket support enabled for real-time audio streaming
```

### Build
```bash
pnpm build
# Production build: ng build --base-href ./ --configuration production
# Output directory: dist/
# Includes service worker for PWA support
```

### Linting
ESLint is configured (`.eslintrc.json`) but no pnpm script is defined in package.json. Run manually:
```bash
pnpm exec eslint src/
```

## Architecture Overview

### Core Service Pattern

**RdioScannerService** (`src/app/components/rdio-scanner/rdio-scanner.service.ts`) is the heart of the application:
- Manages WebSocket connection to backend server
- Handles real-time audio streaming and playback using Web Audio API
- Maintains livefeed state and call queue
- Manages user PIN/authentication state
- Emits events through EventEmitter for component communication
- Uses localStorage for persistence (livefeed map, PIN, hold states)

### Component Structure

The app follows a pages/components split:

**Pages** (`src/app/pages/rdio-scanner/`):
- Route-level components that represent full views
- Main scanner page and admin page with lazy-loaded routes

**Components** (`src/app/components/rdio-scanner/`):
- Reusable UI components organized by feature:
  - `main/` - Primary scanner display and controls (55KB+ component)
  - `admin/` - Admin dashboard with config and tools sub-sections
  - `alerts/` - Alert history and management
  - `favorites/` - Favorite calls/talkgroups
  - `search/` - Call search interface
  - `select/` - System/talkgroup selection
  - `settings/` - User settings
  - `auth-screen/`, `user-login/`, `user-registration/`, `email-verification/` - Authentication flow
  - `stripe-checkout/` - Payment processing
  - `group-admin/` - Multi-tenant group management

### Data Model

Core interfaces are defined in `src/app/components/rdio-scanner/rdio-scanner.ts`:

- **RdioScannerCall**: Represents a radio transmission (audio, metadata, transcript, tone detection)
- **RdioScannerSystem**: Radio system configuration (label, talkgroups, units)
- **RdioScannerTalkgroup**: Talkgroup within a system (groups, tags, LED color, tone sets)
- **RdioScannerConfig**: Application configuration from server (systems, groups, tags, alerts, user settings)
- **RdioScannerAlert**: Tone or keyword-based alert with transcript
- **RdioScannerLivefeedMap**: Tracks active/avoided systems and talkgroups

### WebSocket Communication

The service uses a custom WebSocket protocol with command codes:
- `CAL` - New call
- `CFG` - Configuration update
- `LFM` - Livefeed map update
- `ALT` - Alert notification
- `LSC` - Listener count
- `PIN`/`PNS` - PIN authentication
- `MAX` - Connection limit reached
- `XPR` - Session expired

### Module Organization

- **AppSharedModule** (`src/app/shared/shared.module.ts`): Provides common imports (Material, Forms, Router, Update service) with `forRoot()` and `forChild()` patterns
- **RdioScannerModule**: Main feature module with all scanner components
- **AdminModule**: Lazy-loaded admin interface module

### Audio Playback System

Audio is streamed from the server and played using Web Audio API:
1. Server sends call with audio buffer data
2. Service decodes audio into AudioBuffer
3. AudioBufferSourceNode plays through GainNode for volume control
4. Calls are queued and played sequentially
5. Configurable delay system per system/talkgroup

### Key Services

- **rdio-scanner.service.ts** - Core service (WebSocket, audio, state)
- **favorites.service.ts** - Manage favorite calls
- **alert-sound.service.ts** - Play UI beep sounds
- **tag-color.service.ts** - Manage talkgroup tag colors
- **admin.service.ts** - Admin API operations
- **settings.service.ts** - User settings management

## Environment Configuration

Two environment files:
- `src/environments/environment.ts` - Development (production: false)
- `src/environments/environment.prod.ts` - Production (production: true)

Production build automatically swaps to prod environment (see `angular.json` fileReplacements).

## Development Proxy

The dev server proxy (`src/proxy.conf.js`) forwards most requests to the backend server, except:
- `/admin**` - Handled by Angular router
- `/ng-cli-ws**` - Angular CLI WebSocket
- `/reset**` - Handled by Angular router

Update the `server` constant in proxy config if backend location changes.

## TypeScript Configuration

Strict mode enabled:
- `strict: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `strictTemplates: true` (Angular)

Target: ES2022 with bundler module resolution.

## Styling

- Global styles: `src/styles.scss`
- Component styles: SCSS with encapsulation
- Common component styles: `src/app/components/rdio-scanner/common.scss`
- Material theming configured in shared module

## Important Notes

- The main component (`main.component.ts`) and core service (`rdio-scanner.service.ts`) are large files (50KB+) handling complex state
- User settings are stored both server-side (in config.userSettings) and client-side (localStorage)
- The livefeed map determines which systems/talkgroups are actively streaming
- Admin interface is feature-rich with system/talkgroup management, user/group management, API keys, directory watch, import/export tools
- Alert system supports tone detection (Two-Tone, Hi-Lo, Long) and keyword matching with transcription
- Multi-tenancy is implemented through user groups with isolated access control
