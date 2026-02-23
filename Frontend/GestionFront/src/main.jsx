import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { GestionApp } from './GestionApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GestionApp />
  </StrictMode>,
)
