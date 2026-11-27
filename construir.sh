#!/bin/sh
# Arma la carpeta «publico» con lo único que se publica en Cloudflare Pages.
# Es una lista cerrada a propósito: lo que no está acá (CLAUDE.md, .claude/, borradores, PDF internos) no sale a internet.
# Cloudflare la corre en cada publicación (comando de compilación: sh construir.sh · carpeta de salida: publico).
set -eu
rm -rf publico
mkdir -p publico/assets
cp ./*.html _headers robots.txt sitemap.xml publico/
cp -R assets/css assets/js assets/marca assets/trabajos publico/assets/
cp assets/og.png publico/assets/
echo "Listo: $(find publico -type f | wc -l) archivos en publico/"
