import os

# For shared database with multiple users, this variable should be the same for everyone!
DATABASE_KEY = os.getenv("TASK_DB_KEY", "your_super_secret_database_key_CHANGE_THIS_IN_PRODUCTION!")

# this variable can be vary from one user with another.
SECRET_KEY = os.getenv("AUTH_PEPPER_JWT", "your_super_secret_jwt_key_please_change_this!").encode('utf-8')

# this variable can be vary from one user with another.
# It's like private key. only the one with the correct private key can login. 
# Means even the username and password are correct, but with wrong AUTH_PEPPER variable in the machine, the person still cannot login
PEPPER = os.getenv("AUTH_PEPPER", "a_strong_random_pepper_string_CHANGE_THIS_IN_PRODUCTION!")