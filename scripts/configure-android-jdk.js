'use strict';

const fs = require('node:fs');
const path = require('node:path');
const android = path.resolve(__dirname, '../android');
const javaHome = process.argv[2];
if (!javaHome || !fs.existsSync(path.join(javaHome, 'bin/java'))) {
    throw new Error('Se necesita la ruta del JDK 21 seleccionado.');
}

// Archivos locales ignorados por Git: no publicar rutas de esta computadora.
const local = path.join(android, '.gradle/config.properties');
fs.mkdirSync(path.dirname(local), { recursive: true });
const previous = fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : '';
const property = 'java.home=' + javaHome.replaceAll('\\', '\\\\') + '\n';
fs.writeFileSync(local, /^java\.home=.*$/m.test(previous)
    ? previous.replace(/^java\.home=.*\n?/m, property)
    : previous + (previous && !previous.endsWith('\n') ? '\n' : '') + property);

const ide = path.join(android, '.idea/gradle.xml');
// Conservar los ajustes IDE existentes. En un proyecto nuevo seleccionar la
// macro oficial que lee java.home desde .gradle/config.properties.
if (!fs.existsSync(ide)) {
    fs.mkdirSync(path.dirname(ide), { recursive: true });
    fs.writeFileSync(ide, `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="GradleSettings">
    <option name="linkedExternalProjectsSettings">
      <GradleProjectSettings>
        <option name="externalProjectPath" value="$PROJECT_DIR$" />
        <option name="gradleJvm" value="#GRADLE_LOCAL_JAVA_HOME" />
      </GradleProjectSettings>
    </option>
  </component>
</project>
`);
}
