import webview
from api import Api

def main():
    api = Api()
    webview.create_window('TaskTide Task Manager', 'index.html', js_api=api, width=1200, height=800)
    #webview.start(private_mode=False)
    webview.start(debug=True)

if __name__ == '__main__':
    main()
