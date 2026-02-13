import React from 'react'
import ReactDOM from 'react-dom/client'
import { TonConnectUIProvider } from '@tonconnect/ui-react'
import App from './App.tsx'
import './index.css'

// Use relative path for manifest to work both locally and in production
// The backend will serve this file
const manifestUrl = '/tonconnect-manifest.json'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
)
