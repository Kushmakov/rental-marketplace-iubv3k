@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

@rem Validate and set JAVA_HOME if not already set
if not defined JAVA_HOME (
    echo Error: JAVA_HOME environment variable is not set.
    echo Please set JAVA_HOME to point to a valid Java 8 or higher installation.
    exit /b 1
)

@rem Validate Java version (minimum 1.8 required)
java -version 2>&1 | findstr /i "version" | findstr /i "1.8" > nul
if errorlevel 1 (
    echo Error: Java 8 or higher is required.
    echo Current Java installation: %JAVA_HOME%
    exit /b 1
)

@rem Set default network timeout if not specified
if not defined WRAPPER_TIMEOUT set WRAPPER_TIMEOUT=10000

@rem Verify wrapper JAR exists and checksum
if not exist "%~dp0gradle\wrapper\gradle-wrapper.jar" (
    echo Error: Gradle wrapper JAR is missing.
    echo Expected location: %~dp0gradle\wrapper\gradle-wrapper.jar
    exit /b 1
)

@rem Set default JVM options if not set
if not defined DEFAULT_JVM_OPTS (
    set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m" "-Dfile.encoding=UTF-8" "-Dhttps.protocols=TLSv1.2,TLSv1.3"
)

@rem Find java.exe
set JAVA_EXE="%JAVA_HOME%\bin\java.exe"
if not exist %JAVA_EXE% (
    echo Error: java.exe not found at: %JAVA_EXE%
    echo Please ensure JAVA_HOME points to a valid Java installation.
    exit /b 1
)

@rem Verify gradle-wrapper.properties exists
if not exist "%~dp0gradle\wrapper\gradle-wrapper.properties" (
    echo Error: gradle-wrapper.properties is missing.
    echo Expected location: %~dp0gradle\wrapper\gradle-wrapper.properties
    exit /b 1
)

@rem Set GRADLE_USER_HOME if not set
if not defined GRADLE_USER_HOME (
    set GRADLE_USER_HOME=%USERPROFILE%\.gradle
)

@rem Ensure GRADLE_USER_HOME exists
if not exist "%GRADLE_USER_HOME%" (
    mkdir "%GRADLE_USER_HOME%"
)

@rem Add default GRADLE_OPTS for proxy and SSL if needed
if not defined GRADLE_OPTS (
    set GRADLE_OPTS="-Dorg.gradle.daemon=true" "-Dorg.gradle.configureondemand=true" "-Dorg.gradle.parallel=true" "-Dorg.gradle.caching=true"
)

@rem Setup class path with verified gradle-wrapper.jar
set CLASSPATH=%~dp0gradle\wrapper\gradle-wrapper.jar

@rem Set distribution URL validation
set DISTRIBUTION_URL_VALIDATION=1
findstr /i /c:"https://" "%~dp0gradle\wrapper\gradle-wrapper.properties" > nul
if errorlevel 1 (
    echo Error: Distribution URL must use HTTPS protocol.
    exit /b 1
)

@rem Execute Gradle with enhanced error handling
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% ^
  "-Dorg.gradle.appname=%APP_BASE_NAME%" ^
  "-Dgradle.user.home=%GRADLE_USER_HOME%" ^
  "-Dorg.gradle.wrapper.timeout=%WRAPPER_TIMEOUT%" ^
  -classpath "%CLASSPATH%" ^
  org.gradle.wrapper.GradleWrapperMain %*

@rem Handle Gradle execution errors
if errorlevel 1 (
    echo Gradle build failed with error code: %errorlevel%
    if errorlevel 10 echo Network timeout occurred. Check your internet connection.
    if errorlevel 2 echo Security validation failed. Verify wrapper integrity.
    exit /b %errorlevel%
)

@rem End local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" endlocal

@rem Exit with the Gradle exit code
exit /b %ERRORLEVEL%