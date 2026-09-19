/** @type {import('next').NextConfig} */
const nextConfig = {
  // En production on veut que les erreurs TS bloquent le build.
  // Pendant le dev, on garde la valeur false aussi (Zod + schémas te protègent déjà).
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig
