package com.movieverse.service;

import com.movieverse.dto.FavouriteRequest;
import com.movieverse.entity.Favourite;
import com.movieverse.entity.Movie;
import com.movieverse.entity.User;
import com.movieverse.exception.BadRequestException;
import com.movieverse.exception.ResourceNotFoundException;
import com.movieverse.repository.FavouriteRepository;
import com.movieverse.repository.MovieRepository;
import com.movieverse.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * FavouriteService - Manages user bookmarks and watchlist items.
 */
@Service
public class FavouriteService {

    private final FavouriteRepository favouriteRepository;
    private final UserRepository userRepository;
    private final MovieRepository movieRepository;

    @Autowired
    public FavouriteService(FavouriteRepository favouriteRepository,
                            UserRepository userRepository,
                            MovieRepository movieRepository) {
        this.favouriteRepository = favouriteRepository;
        this.userRepository = userRepository;
        this.movieRepository = movieRepository;
    }

    @Transactional
    public Favourite addFavourite(FavouriteRequest request) {
        Long userId = request.getUserId();
        Long movieId = request.getMovieId();

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        Movie movie = movieRepository.findById(movieId)
                .orElseThrow(() -> new ResourceNotFoundException("Movie not found with id: " + movieId));

        // Check if already in favourites
        if (favouriteRepository.existsByUserIdAndMovieId(userId, movieId)) {
            throw new BadRequestException("Movie is already in favourites");
        }

        Favourite favourite = new Favourite(user, movie);
        return favouriteRepository.save(favourite);
    }

    public List<Favourite> getFavouritesByUserId(Long userId) {
        // Validate user existence
        if (!userRepository.existsById(userId)) {
            throw new ResourceNotFoundException("User not found with id: " + userId);
        }
        return favouriteRepository.findByUserId(userId);
    }

    @Transactional
    public void removeFavourite(Long userId, Long movieId) {
        Favourite fav = favouriteRepository.findByUserIdAndMovieId(userId, movieId)
                .orElseThrow(() -> new ResourceNotFoundException("Favourite entry not found for user: " + userId + " and movie: " + movieId));

        favouriteRepository.delete(fav);
    }
}
