from flask import Blueprint, redirect, render_template, request, url_for

flashcards_bp = Blueprint('flashcards_bp', __name__)


@flashcards_bp.route('/flashcards')
def flashcards():
    return render_template('flashcards.html', page='decks', deck_id=None)


@flashcards_bp.route('/flashcards/decks/<deck_id>')
def flashcards_deck(deck_id):
    return render_template('flashcards.html', page='deck', deck_id=deck_id)


@flashcards_bp.route('/flashcards/decks/<deck_id>/edit')
def flashcards_edit(deck_id):
    query = request.query_string.decode()
    destination = url_for('flashcards_bp.flashcards_deck', deck_id=deck_id)
    return redirect(f'{destination}?{query}' if query else destination)


@flashcards_bp.route('/flashcards/decks/<deck_id>/study')
def flashcards_study(deck_id):
    query = request.query_string.decode()
    destination = url_for('flashcards_bp.flashcards_deck', deck_id=deck_id)
    return redirect(f'{destination}?{query}' if query else destination)
