# Track Union

Web para combinar trozos de varios tracks GPX en uno solo. Funciona entera en el
navegador: los ficheros GPX **no se suben a ningún servidor**.

## Uso

1. **Tracks**: arrastra uno o varios `.gpx` (se admiten tracks, rutas y varios segmentos por fichero).
2. **Seleccionar trozo**: elige un track y marca el inicio (A) y el fin (B) con los deslizadores o arrastrando los marcadores en el mapa (se ajustan al punto más cercano). Si A va después de B, el trozo se recorre al revés.
3. **Composición**: añade los trozos, reordénalos (▲▼), inviértelos (⇄) o usa «Orientar automáticamente». Los saltos entre trozos se muestran en rojo (aviso si superan 50 m).
4. **Exportar**: descarga el GPX unido, como segmento continuo o con un segmento por trozo, y con o sin los tiempos originales.

Necesita conexión a internet para cargar Leaflet y los mapas de OpenStreetMap.

## Estructura

- `static/` — la web completa (`index.html`, `app.js`, `gpx.js`, `style.css`). Es lo único que se publica.
- `static/gpx.js` — lectura y escritura de GPX (también se usa desde los tests en Node).
- `main.py` — servidor local opcional para probarla (solo librería estándar de Python).

## Desarrollo local

```bash
python main.py          # abre http://127.0.0.1:5000
```

Tests (Node 20+): `npm install && npm test`

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube el proyecto a la rama `main`.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada push a `main` ejecuta los tests y publica `static/` en
   `https://<usuario>.github.io/<repositorio>/`.

La carpeta `static/` también se puede publicar tal cual en Netlify, Cloudflare Pages
o cualquier hosting de ficheros estáticos.
