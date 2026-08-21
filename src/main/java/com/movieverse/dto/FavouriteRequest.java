package com.movieverse.dto;

import jakarta.validation.constraints.NotNull;

/**
 * FavouriteRequest DTO - Request to add a movie to favourites.
 */
public class FavouriteRequest {

    @NotNull(message = "User ID is required")
    private Long userId;

    @NotNull(message = "Movie ID is required")
    private Long movieId;

    public FavouriteRequest() {
    }

    public FavouriteRequest(Long userId, Long movieId) {
        this.userId = userId;
        this.movieId = movieId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getMovieId() {
        return movieId;
    }

    public void setMovieId(Long movieId) {
        this.movieId = movieId;
    }
}
