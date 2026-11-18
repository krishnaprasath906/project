import os
from pathlib import Path
from flask import Flask, send_from_directory, jsonify, render_template
from flask_cors import CORS
from backend.config import Config
from backend.database import init_db
from backend.routes.auth_routes import auth_bp
from backend.routes.analysis_routes import analysis_bp
from backend.routes.alert_routes import alert_bp
from backend.routes.analytics_routes import analytics_bp
from backend.routes.prediction_routes import prediction_bp

def create_app():
    # Make sure storage folders exist
    Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    Config.PROCESSED_FOLDER.mkdir(parents=True, exist_ok=True)
    Config.DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Initialize DB schema and seed data
    init_db()

    app = Flask(
        __name__,
        static_folder=str(Config.FRONTEND_DIR),
        template_folder=str(Config.FRONTEND_DIR)
    )
    app.config.from_object(Config)
    app.secret_key = Config.SECRET_KEY

    # Enable CORS for full-stack integration
    CORS(app, supports_credentials=True)

    # Register API Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(alert_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(prediction_bp)

    # Static file serving for uploads and processed images
    @app.route('/uploads/<path:filename>')
    def serve_upload(filename):
        return send_from_directory(str(Config.UPLOAD_FOLDER), filename)

    @app.route('/processed/<path:filename>')
    def serve_processed(filename):
        return send_from_directory(str(Config.PROCESSED_FOLDER), filename)

    # Frontend routes - serve login page first on root localhost link
    @app.route('/')
    def serve_index():
        from flask import session
        if 'user_id' in session:
            return send_from_directory(str(Config.FRONTEND_DIR), 'index.html')
        return send_from_directory(str(Config.FRONTEND_DIR), 'login.html')

    @app.route('/<path:filename>')
    def serve_frontend(filename):
        target = Config.FRONTEND_DIR / filename
        if target.exists() and not target.is_dir():
            return send_from_directory(str(Config.FRONTEND_DIR), filename)
        elif (Config.FRONTEND_DIR / f"{filename}.html").exists():
            return send_from_directory(str(Config.FRONTEND_DIR), f"{filename}.html")
        return send_from_directory(str(Config.FRONTEND_DIR), 'login.html')

    # Global safe error handlers (Section 40: Do not expose stack traces to users)
    @app.errorhandler(404)
    def handle_404(e):
        return jsonify({'success': False, 'message': 'Requested resource or API endpoint not found.'}), 404

    @app.errorhandler(500)
    def handle_500(e):
        return jsonify({'success': False, 'message': 'An internal processing error occurred in RiverGuard AI engine.'}), 500

    @app.errorhandler(413)
    def handle_413(e):
        return jsonify({'success': False, 'message': 'Uploaded image file exceeds the 16MB maximum size limit.'}), 413

    return app

app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5000))
    print(f"============================================================")
    print(f" RIVERGUARD AI // WATER LEVEL MONITORING & FLOOD DETECTION ")
    print(f" River Command Center listening at: http://127.0.0.1:{port}")
    print(f"============================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
