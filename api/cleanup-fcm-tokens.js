name: 🧹 Limpieza Diaria de FCM Tokens

on:
  schedule:
    - cron: '0 3 * * *'  # 03:00 UTC = 00:00 Argentina
  workflow_dispatch:

jobs:
  cleanup:
    name: Limpieza de Tokens FCM
    runs-on: ubuntu-latest
    steps:
      - name: 🔥 Calentamiento inicial
        run: |
          echo "🔥 Calentando función de limpieza..."
          # Warm-up paralelo
          curl -s "https://nuevo-palabra-del-dia-backend.vercel.app/api/cleanup-fcm-tokens" > /dev/null 2>&1 &
          curl -s "https://nuevo-palabra-del-dia-backend.vercel.app/api/cleanup-fcm-tokens" > /dev/null 2>&1 &
          echo "⏳ Esperando 20 segundos para cold start..."
          sleep 20

      - name: 🧹 Ejecutar limpieza robusta
        run: |
          echo "🧹 INICIANDO LIMPIEZA DE FCM TOKENS..."
          echo "🕐 Timestamp: $(date -u)"
          
          MAX_RETRIES=4
          RETRY_COUNT=0
          SUCCESS=false
          LAST_RESPONSE=""
          
          while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SUCCESS" = "false" ]; do
            echo ""
            echo "🔄 INTENTO $((RETRY_COUNT + 1)) de $MAX_RETRIES"
            
            START_TIME=$(date +%s)
            
            # Usar POST vacío como espera tu función
            RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
              "https://nuevo-palabra-del-dia-backend.vercel.app/api/cleanup-fcm-tokens" \
              -H "Content-Type: application/json" \
              -H "User-Agent: GitHub-Cleanup/1.0" \
              -H "X-Cleanup-Request: $(date +%s)" \
              -d '{}' \
              --connect-timeout 120 \
              --max-time 180 \
              --retry 2 \
              --retry-delay 5)
            
            END_TIME=$(date +%s)
            DURATION=$((END_TIME - START_TIME))
            
            HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
            RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)
            LAST_RESPONSE="$RESPONSE_BODY"
            
            echo "⏱️  Duración: ${DURATION}s"
            echo "📡 HTTP Code: $HTTP_CODE"
            
            if [ "$HTTP_CODE" -eq 200 ]; then
              echo "✅ RESPUESTA EXITOSA"
              echo "📦 Respuesta: $RESPONSE_BODY"
              
              # Verificar que la respuesta sea válida
              if echo "$RESPONSE_BODY" | grep -q '"success":true'; then
                echo "🎉 LIMPIEZA COMPLETADA EXITOSAMENTE"
                SUCCESS=true
              else
                echo "⚠️ Respuesta 200 pero sin success:true"
                RETRY_COUNT=$((RETRY_COUNT + 1))
              fi
              
            else
              echo "❌ ERROR HTTP: $HTTP_CODE"
              echo "📋 Respuesta: $RESPONSE_BODY"
              RETRY_COUNT=$((RETRY_COUNT + 1))
              
              if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                RETRY_DELAY=$((30 * RETRY_COUNT))
                echo "💤 Esperando $RETRY_DELAY segundos..."
                sleep $RETRY_DELAY
                
                # Warm-up adicional entre reintentos
                echo "🔥 Warm-up adicional..."
                curl -s "https://nuevo-palabra-del-dia-backend.vercel.app/api/cleanup-fcm-tokens" > /dev/null 2>&1 &
                sleep 10
              fi
            fi
          done
          
          # RESULTADO FINAL
          echo ""
          echo "=========================================="
          if [ "$SUCCESS" = "true" ]; then
            echo "🎊 LIMPIEZA EXITOSA"
            echo "📊 Resumen:"
            echo "   ✅ Intentos: $((RETRY_COUNT + 1))"
            echo "   ✅ HTTP Final: $HTTP_CODE"
            echo "   ✅ Duración: ${DURATION}s"
            echo "   ✅ Hora: $(date -u)"
          else
            echo "💥 FALLO EN LIMPIEZA"
            echo "📊 Resumen:"
            echo "   ❌ Intentos fallidos: $MAX_RETRIES"
            echo "   ❌ Último HTTP: $HTTP_CODE"
            echo "   ❌ Última respuesta: $LAST_RESPONSE"
            echo ""
            echo "🚨 ACCIONES REQUERIDAS:"
            echo "   1. Revisar logs de Vercel"
            echo "   2. Verificar función cleanup-fcm-tokens"
            echo "   3. Comprobar variables de entorno Firebase"
            exit 1
          fi
          echo "=========================================="
        timeout-minutes: 10

      - name: 📊 Reporte de éxito
        if: success()
        run: |
          echo "🧹 REPORTE DE LIMPIEZA - COMPLETADO"
          echo "=================================="
          echo "✅ Estado: ÉXITO"
          echo "🕐 Hora: $(date -u)"
          echo "📝 Acción: Limpieza de tokens FCM"
          echo "👤 Usuarios procesados: Todos"
          echo "🗑️  Tokens optimizados: ✅"
          echo "=================================="

      - name: 🚨 Diagnóstico de fallo
        if: failure()
        run: |
          echo "🚨 DIAGNÓSTICO DE FALLO - LIMPIEZA"
          echo "=================================="
          echo "🔍 Realizando verificaciones..."
          
          echo ""
          echo "1. 📡 CONECTIVIDAD DEL ENDPOINT..."
          curl -I -s -o /dev/null -w "HTTP: %{http_code}\nTiempo: %{time_total}s\n" \
            "https://nuevo-palabra-del-dia-backend.vercel.app/api/cleanup-fcm-tokens" || echo "❌ Endpoint inaccesible"
          
          echo ""
          echo "2. 🌐 VERIFICACIÓN DNS..."
          nslookup nuevo-palabra-del-dia-backend.vercel.app 2>/dev/null | grep -A 2 "Name:" || echo "❌ DNS fallido"
          
          echo ""
          echo "3. ⚡ PRUEBA RÁPIDA..."
          timeout 15 curl -s "https://nuevo-palabra-del-dia-backend.vercel.app" > /dev/null && echo "✅ Dominio accesible" || echo "❌ Dominio inaccesible"
          
          echo ""
          echo "🔧 POSIBLES SOLUCIONES:"
          echo "   • Verificar que la función cleanup-fcm-tokens exista"
          echo "   • Revisar variables de entorno en Vercel"
          echo "   • Comprobar credenciales de Firebase"
          echo "   • Aumentar timeout en Vercel si es necesario"
          echo "=================================="
