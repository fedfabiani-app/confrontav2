# Oroscopo Italiano - Replit Configuration

## Overview

Oroscopo Italiano is a Progressive Web App (PWA) that aggregates and compares Italian horoscope predictions from multiple sources. The application uses artificial intelligence to create copyright-safe summaries, extract structured ratings for different life aspects (Relationships, Work, Wellness), and perform tone analysis. Built as a full-stack TypeScript application, it provides both web and mobile experiences through PWA capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and building
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **PWA Features**: Service worker implementation for offline functionality, caching strategy, and installability
- **Daily/Weekly Toggle**: SignDetail page features a view toggle for switching between daily and weekly horoscope displays with Monday-based week calculation and Italian date formatting

### Backend Architecture
- **Runtime**: Node.js with Express.js framework for RESTful API
- **Database**: Drizzle ORM configured for PostgreSQL (though currently uses Prisma client)
- **Job Processing**: Custom job queue system using p-queue for orchestrating scraping and AI processing tasks
- **Worker Architecture**: Two dedicated worker modules:
  - Scraper worker for HTML parsing and content extraction
  - OpenAI worker for AI-powered content analysis and processing

### Data Processing Pipeline
- **Web Scraping**: Axios and Cheerio for fetching and parsing HTML content from Italian horoscope sources
- **AI Processing**: OpenAI GPT-5 integration for content summarization, rating extraction, and tone analysis
- **Content Strategy**: Copyright-safe content generation through AI paraphrasing and synthesis
- **Rate Limiting**: Domain-specific backoff strategies and OpenAI API rate limiting

### Database Schema
- **Zodiac Signs**: Italian and English names, date ranges, symbols
- **Sources**: Daily horoscope source configuration with reliability scores and URL patterns (14+ sources)
- **Weekly Sources**: Weekly horoscope source configuration with reliability scores and URL patterns (15 sources)
- **Horoscopes (Daily)**: Daily predictions with AI-generated summaries, superquotes (max 80 chars), and structured ratings
- **Weekly Horoscopes**: Weekly predictions with same structure as daily (AI summaries, superquotes, ratings) for Monday-based weeks
- **Users**: Basic user management for future authentication features

### API Design
- **REST Endpoints**: Organized routes for zodiac signs, sources, horoscopes, and refresh operations
- **Manual Refresh**: Dedicated endpoints for on-demand data updates (daily: `/api/refresh/sign/:sign`, weekly: `/api/refresh-weekly/sign/:sign`)
- **Aggregation**: Real-time calculation of average ratings and majority tone analysis for both daily and weekly horoscopes
- **Input Validation**: Zod schema validation for type safety and data integrity
- **Week-based Queries**: Weekly endpoints use `weekStartDate` parameter (Monday-based) for fetching weekly horoscope data

### Security Considerations
- **Environment Variables**: Secure handling of API keys and database credentials
- **CORS Configuration**: Restricted to same-origin requests
- **Input Sanitization**: Validation and sanitization of user inputs
- **Rate Limiting**: Protection against abuse of refresh endpoints

### Progressive Web App Features
- **Offline Strategy**: Service worker caches app shell and read-only GET requests
- **Manifest**: Web app manifest for native app-like installation
- **Responsive Design**: Mobile-first design with bottom navigation for mobile devices
- **Performance**: Optimized loading with code splitting and lazy loading

## External Dependencies

### Third-Party Services
- **OpenAI API**: GPT-5 model for content summarization, rating extraction, and tone analysis
- **PostgreSQL Database**: Primary data storage (configured via Drizzle, though Prisma client is currently used)

### External APIs and Scraping Sources
- **Repubblica.it**: Italian news and horoscope source with pattern `/oroscopo/`
- **IoLavoro.it**: Job-focused horoscope content with date-specific URL patterns
- **Multiple Italian Sources**: 14+ configured sources for comprehensive horoscope aggregation

### Development and Build Tools
- **Vite**: Frontend build tool and development server
- **TypeScript**: Type safety across frontend and backend
- **ESBuild**: Backend bundling for production deployment
- **PostCSS & Autoprefixer**: CSS processing pipeline

### UI and Component Libraries
- **Radix UI**: Accessible component primitives for complex UI elements
- **Lucide React**: Icon library for consistent iconography
- **Class Variance Authority**: Type-safe component variant management
- **Tailwind Merge & CLSX**: Utility for conditional CSS class management

### Backend Processing Libraries
- **p-queue**: Job queue management for controlled concurrent processing
- **Cheerio**: Server-side HTML parsing and manipulation
- **Axios**: HTTP client for web scraping operations
- **Zod**: Runtime type validation and schema definition

### Development Utilities
- **React Query Devtools**: Development debugging for API state
- **Replit Plugins**: Development environment integration for runtime error handling and debugging