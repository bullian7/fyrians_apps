import os

from flask import Flask, g

from db import init_app as init_db_app
from blueprints.account import account_bp
from blueprints.home import home_bp
from blueprints.fyrdle import fyrdle_bp
from blueprints.listmaker import listmaker_bp
from blueprints.schedule import schedule_bp
from blueprints.spotify import spotify_bp
from blueprints.sudoku import sudoku_bp
from blueprints.typing import typing_bp
from blueprints.reaction import reaction_bp
from blueprints.quotebook import quotebook_bp

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-change-in-prod')
app.config['DATABASE'] = os.path.join(app.root_path, 'fyrians_apps.db')
init_db_app(app)

app.register_blueprint(home_bp)
app.register_blueprint(account_bp)
app.register_blueprint(fyrdle_bp)
app.register_blueprint(listmaker_bp)
app.register_blueprint(schedule_bp)
app.register_blueprint(typing_bp)
app.register_blueprint(spotify_bp)
app.register_blueprint(sudoku_bp)
app.register_blueprint(reaction_bp)
app.register_blueprint(quotebook_bp)


@app.context_processor
def inject_current_user():
    return {'current_user': g.get('current_user')}


if __name__ == '__main__':
    app.run(debug=True, port=5001)
