'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fetchHealth } from '@/lib/api';

interface HealthStatus {
  status: string;
  connected: boolean;
}

export default function HanaDemo() {
  const [healthResult, setHealthResult] = useState<HealthStatus | null>(null);
  const [loading,      setLoading]      = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const handleHealth = async () => {
    setLoading('health'); setError(null);
    try { const d = await fetchHealth(); setHealthResult(d); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unknown error'); }
    finally { setLoading(null); }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 transition-colors duration-200">

      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/arcelormittal-logo.png" alt="ArcelorMittal" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">DIANA HANA Tools</h1>
        </div>

        <div className="space-y-4">
          {/* Health Check card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-800 dark:text-gray-100">Health Check</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Verify HANA connection</p>
              </div>
              <button onClick={handleHealth} disabled={loading === 'health'}
                className="px-4 py-2 bg-am-orange-500 text-white rounded-lg text-sm font-medium hover:bg-am-orange-600 disabled:opacity-50 transition-colors">
                {loading === 'health' ? 'Checking...' : 'Check'}
              </button>
            </div>
            {healthResult && (
              <div className={`rounded-lg p-3 flex items-center justify-between ${
                healthResult.connected
                  ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800'
              }`}>
                <span className={`font-medium ${healthResult.connected ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                  {healthResult.connected ? 'Connected' : 'Disconnected'}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 uppercase">{healthResult.status}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-4">
              <p className="text-red-700 dark:text-red-400 text-sm"><span className="font-semibold">Error: </span>{error}</p>
            </div>
          )}
        </div>

        {/* Tech badges */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {['Next.js 14', 'NestJS 10', 'SAP HANA'].map(tech => (
            <div key={tech} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-xs text-gray-500 dark:text-gray-400 font-medium">
              {tech}
            </div>
          ))}
        </div>

        {/* Calc View Explorer link */}
        <div className="mt-4">
          <Link href="/calcview"
            className="block w-full text-center px-4 py-3 bg-white dark:bg-gray-900 border border-am-orange-200 dark:border-am-orange-900 rounded-2xl text-sm font-medium text-am-orange-600 dark:text-am-orange-400 hover:bg-am-orange-50 dark:hover:bg-am-orange-900/20 hover:border-am-orange-300 dark:hover:border-am-orange-800 transition-colors">
            Open Calculation View Explorer →
          </Link>
        </div>
      </div>
    </div>
  );
}
