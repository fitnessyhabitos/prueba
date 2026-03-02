import os
import json

# 1. Diccionario de traducción: Nombre original (Inglés) -> Nuevo nombre (Español)
traducciones = {
    "abductors.png": "abductores.png",
    "abs.png": "abs.png",  # Mantenemos 'abs' porque tu app.js ya usa "Abs"
    "adductors.png": "aductores.png",
    "all.png": "cuerpo_completo.png",
    "all_lower.png": "tren_inferior.png",
    "all_upper.png": "tren_superior.png",
    "back.png": "espalda.png",
    "back_lower.png": "espalda_baja.png",
    "back_upper.png": "espalda_alta.png",
    "biceps.png": "biceps.png",
    "calfs.png": "gemelos.png",
    "chest.png": "pecho.png",
    "core.png": "core.png",
    "core_lower.png": "core_inferior.png",
    "core_side.png": "oblicuos.png",
    "core_upper.png": "core_superior.png",
    "forearm.png": "antebrazo.png",
    "forearms.png": "antebrazos.png",
    "gluteus.png": "gluteos.png",
    "hamstring.png": "isquios.png",
    "hands.png": "manos.png",
    "latissimus.png": "dorsales.png",
    "legs.png": "piernas.png",
    "neck.png": "cuello.png",
    "quadriceps.png": "cuadriceps.png",
    "shoulders.png": "hombros.png",
    "shoulders_back.png": "hombros_posterior.png",
    "shoulders_front.png": "hombros_frontal.png",
    "triceps.png": "triceps.png"
}

# IMPORTANTE: Cambia esto si tus imágenes están en otra subcarpeta, por ejemplo "./img/muscles"
carpeta_imagenes = "." 

print("Iniciando renombrado de archivos...")

archivos_renombrados = 0

for nombre_original, nombre_nuevo in traducciones.items():
    ruta_original = os.path.join(carpeta_imagenes, nombre_original)
    ruta_nueva = os.path.join(carpeta_imagenes, nombre_nuevo)
    
    if os.path.exists(ruta_original):
        os.rename(ruta_original, ruta_nueva)
        print(f"✅ Renombrado: {nombre_original} -> {nombre_nuevo}")
        archivos_renombrados += 1
    else:
        # Silenciamos el error si ya fue renombrado antes
        pass

print(f"\n🎉 Proceso completado. Se renombraron {archivos_renombrados} archivos.")

# 2. Generar el mapeo para tu app.js (SPA)
# Aquí enlazamos las Keys de tu base de datos con los nuevos archivos en español
mapeo_app = {
    "Pecho": "pecho.png",
    "Espalda": "espalda.png",
    "Cuádriceps": "cuadriceps.png",
    "Isquios": "isquios.png",
    "Glúteos": "gluteos.png",
    "Hombros": "hombros.png",
    "Bíceps": "biceps.png",
    "Tríceps": "triceps.png",
    "Gemelos": "gemelos.png",
    "Pierna": "piernas.png",
    "Brazos": "biceps.png", # En tu app usas "Brazos" genérico, lo enlazamos a biceps
    "Abs": "abs.png"
}

# Escribir el objeto en un archivo JSON
ruta_json = os.path.join(carpeta_imagenes, "fileMapping.json")
with open(ruta_json, "w", encoding="utf-8") as f:
    json.dump(mapeo_app, f, indent=4, ensure_ascii=False)

print(f"📄 Archivo de mapeo para app.js generado en: {ruta_json}")