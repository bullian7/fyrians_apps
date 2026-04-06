from flask import Blueprint, render_template

from applets import APPLETS

home_bp = Blueprint('home_bp', __name__)


@home_bp.route('/')
def home():
    return render_template('home.html', applets=APPLETS, default_applet=APPLETS[0])
