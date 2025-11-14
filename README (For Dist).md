# Prismtask - Task Manager

local task manager

how to start:

* IMPORTANT:
  before run everything, please make sure to adjust all env variables in your system (see env\_variables.py):

  1. TASK\_DB\_KEY
  2. AUTH\_PEPPER\_JWT
  3. AUTH\_PEPPER

* Create user:
  run user\_manager.exe to manage account
* Run Application:

  * click run\_desktop.exe

* For user using that used Prismtask previously:

  * Plain SQLite3 from previous versions must be migrated and encrypted (encryption using "sqlcipher3-wheels") use db\_migration.exe.
