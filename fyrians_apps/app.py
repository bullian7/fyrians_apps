import os

from flask import Flask

from blueprints.home import home_bp
from blueprints.schedule import schedule_bp
from blueprints.spotify import spotify_bp
from blueprints.sudoku import sudoku_bp
from blueprints.typing import typing_bp

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-change-in-prod')

app.register_blueprint(home_bp)
app.register_blueprint(schedule_bp)
app.register_blueprint(typing_bp)
app.register_blueprint(spotify_bp)
app.register_blueprint(sudoku_bp)


if __name__ == '__main__':
    app.run(debug=True)
