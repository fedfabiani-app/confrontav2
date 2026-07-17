# Oroscopo Italiano - PWA

Una Progressive Web App che confronta previsioni astrologiche italiane da fonti multiple, utilizzando intelligenza artificiale per analisi approfondite e sintesi copyright-safe.

## ✨ Caratteristiche

- **📱 Progressive Web App**: Installabile, supporto offline, notifiche push
- **🤖 Analisi AI**: Claude Haiku 4.5 per estrazione ratings e analisi del tono
- **📊 Confronto Multi-Source**: Aggregazione da 14 siti italiani autorevoli
- **⭐ Sistema di Rating**: Valutazioni 1-5 stelle per Relazioni, Lavoro, Benessere
- **🎯 Copyright-Safe**: Contenuti rielaborati per garantire originalità
- **🔄 Aggiornamento Manuale**: Controllo completo sui tempi di refresh
- **📱 Responsive Design**: Ottimizzato per desktop e mobile

## 🛠️ Stack Tecnologico

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** per componenti
- **TanStack React Query** per gestione stato/cache
- **Wouter** per routing client-side
- **Service Worker** per funzionalità PWA

### Backend
- **Node.js** + **Express.js**
- **Prisma ORM** con **Postgres**
- **p-queue** per orchestrazione job
- **Cheerio** per HTML parsing
- **Axios** per richieste HTTP
- **OpenAI API** per analisi NLP

### Database
- **Postgres** con Prisma
- Indici ottimizzati per performance
- Vincoli di unicità per evitare duplicati

## 🚀 Setup Rapido

### Prerequisiti
- **Node.js** 18+ 
- **MySQL** 8.0+
- **OpenAI API Key**

### Installazione

1. **Clona il repository**
```bash
git clone <repository-url>
cd oroscopo-italiano
