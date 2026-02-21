# MongoDB Atlas - Pasos Exactos para Conectar

## Paso 1: Crear Cuenta
1. Ve a: https://www.mongodb.com/cloud/atlas
2. Click en "Try Free" 
3. Completa con tu email y contraseña
4. Confirma tu email

## Paso 2: Crear Organización y Proyecto
1. Al entrar, crea una **Organización** (nombre: "Personal")
2. Crea un **Proyecto** (nombre: "NotesSync")
3. Click en "Create Project"

## Paso 3: Crear Cluster Gratuito
1. En el proyecto, click en "Build a Database"
2. Selecciona **"Free"** (M0 Sandbox)
3. Cloud Provider: **AWS** (o el que prefieras)
4. Region: El que quieras (más cerca = mejor)
5. Cluster Name: "NotesCluster"
6. Click en **"Create Cluster"**
7. Espera 1-3 minutos hasta que diga "Running"

## Paso 4: Crear Usuario de Base de Datos
1. Click en "Database Access" (en menú izquierda)
2. Click en "Add New Database User"
3. **Authentication Method**: Password
4. **Username**: `notesuser`
5. **Password**: `NotesSync123` (o la que quieras)
6. **Database User Privileges**: "Atlas admin"
7. Click en "Add User"

## Paso 5: Permitir Acceso desde Cualquier IP
1. Click en "Network Access" (menú izquierda)
2. Click en "Add IP Address"
3. En "Access List Entry", escribe: `0.0.0.0/0`
4. Click en "Confirm"

## Paso 6: Obtener Connection String
1. Click en "Database" (menú izquierda)
2. Click en "Connect" en tu cluster
3. Selecciona **"Connect your application"**
4. Copia el string que aparece
5. Debe verse algo así:
   ```
   mongodb+srv://notesuser:<password>@notescluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

## Paso 7: Pegar en la App
1. Abre la app (index.html)
2. En el campo de MongoDB, pega el string
3. **REEMPLAZA** `<password>` con la contraseña que pusiste en Paso 4
4. Quedará algo como:
   ```
   mongodb+srv://notesuser:NotesSync123!@notescluster.xxxxx.mongodb.net/
   mongodb+srv://noteuser:NotesSync123@notescluster.c3yjq2b.mongodb.net/?appName=NotesCluster
   mongodb+srv://noteuser:NotesSync123@notescluster.c3yjq2b.mongodb.net/?appName=notessync
   ```
5. Click en "Conectar"

##