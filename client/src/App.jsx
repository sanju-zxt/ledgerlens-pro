import { BrowserRouter, Routes, Route } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "./hooks/useAuth"
import Layout from "./components/Layout"
import { lazy, Suspense } from "react"
const Dashboard = lazy(() => import("./pages/Dashboard"))
const Transactions = lazy(() => import("./pages/Transactions"))
const Forecast = lazy(() => import("./pages/Forecast"))
const Settings = lazy(() => import("./pages/Settings"))
const Recurring = lazy(() => import("./pages/Recurring"))
const Anomalies = lazy(() => import("./pages/Anomalies"))
const Insights = lazy(() => import("./pages/Insights"))
const ModelQuality = lazy(() => import("./pages/ModelQuality"))
const EngineeringScorecard = lazy(() => import("./pages/EngineeringScorecard"))
const Updates = lazy(() => import("./pages/Updates"))
const Login = lazy(() => import("./pages/Login"))
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1, refetchOnWindowFocus: false } }
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen grid place-items-center text-slate-500">Loading LedgerLens…</div>}><Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/verify-email" element={<Login />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/forecast" element={<Forecast />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/recurring" element={<Recurring />} />
              <Route path="/anomalies" element={<Anomalies />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/model-quality" element={<ModelQuality />} />
              <Route path="/quality" element={<EngineeringScorecard />} />
              <Route path="/updates" element={<Updates />} />
            </Route>
          </Routes></Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
