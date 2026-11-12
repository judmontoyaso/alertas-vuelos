# Alertas de vuelos

Vigila rutas aéreas y avisa por correo o Telegram cuando el precio baja del tope que definas.
Next.js (App Router) en Vercel, precios de Google Flights vía SerpApi, alertas guardadas en Supabase.

## Cómo funciona

1. En el panel creas una alerta: origen, destino, fechas, precio tope y a dónde avisar.
2. Un Cron Job de Vercel llama a `/api/check-prices` una vez al día (12:00 UTC, 7:00 a. m. en Colombia).
3. Si el precio más bajo está en el tope o por debajo, se envía el aviso. Solo se repite si el
   precio baja aún más o pasan 48 horas.

## Configuración

1. En Supabase, ejecuta `supabase/schema.sql` en el SQL Editor.
2. En Vercel (Settings, Environment Variables) agrega las variables de `.env.example`.
   `ACCESS_TOKEN`, `CRON_SECRET`, `SERPAPI_KEY`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
   son obligatorias; Resend y Telegram son opcionales, pero hace falta al menos uno para recibir avisos.
3. Despliega a producción (`npx vercel --prod`). El cron solo corre en producción.

Cada alerta activa gasta una búsqueda de SerpApi al día, más las de "Consultar precio ahora".

## Desarrollo local

```bash
cp .env.example .env.local   # y completa los valores
npm run dev
```

Para probar el cron a mano:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/check-prices
```
