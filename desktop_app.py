import webview
from api import Api

def main():
    api = Api()
    window = webview.create_window('TaskTide Task Manager', 'index.html', js_api=api, width=1200, height=800)

    def on_loaded():
        zoom_script = """
        (function() {
            let zoom = 1.0;
            document.addEventListener('wheel', function(e) {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    zoom = Math.max(0.5, Math.min(3, zoom + delta)); // Clamp zoom
                    document.body.style.zoom = zoom;
                }
            }, { passive: false });
        })();
        """
        window.evaluate_js(zoom_script)

    window.events.loaded += on_loaded
    #webview.start(private_mode=False)
    webview.start(debug=True)

if __name__ == '__main__':
    main()
