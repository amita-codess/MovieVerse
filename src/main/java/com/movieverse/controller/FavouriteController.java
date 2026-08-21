package com.movieverse.controller;

import com.movieverse.dto.ApiResponse;
import com.movieverse.dto.FavouriteRequest;
import com.movieverse.entity.Favourite;
import com.movieverse.service.FavouriteService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * FavouriteController - REST Controller for user movie bookmarking operations.
 * Base Path: /api/favourites
 */
@RestController
@RequestMapping("/api/favourites")
@CrossOrigin(origins = "*")
public class FavouriteController {

    private final FavouriteService favouriteService;

    @Autowired
    public FavouriteController(FavouriteService favouriteService) {
        this.favouriteService = favouriteService;
    }

    /**
     * POST /api/favourites - Add a movie to user's favourites list.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<Favourite>> addFavourite(@Valid @RequestBody FavouriteRequest request) {
        Favourite favourite = favouriteService.addFavourite(request);
        ApiResponse<Favourite> response = new ApiResponse<>(
                HttpStatus.CREATED.value(),
                "Movie added to favourites successfully",
                favourite
        );
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    /**
     * GET /api/favourites/{userId} - Retrieve all favourite movies bookmarked by a user.
     */
    @GetMapping("/{userId}")
    public ResponseEntity<List<Favourite>> getFavourites(@PathVariable Long userId) {
        List<Favourite> favourites = favouriteService.getFavouritesByUserId(userId);
        return ResponseEntity.ok(favourites);
    }

    /**
     * DELETE /api/favourites/{userId}/{movieId} - Remove a movie from user's favourites.
     */
    @DeleteMapping("/{userId}/{movieId}")
    public ResponseEntity<ApiResponse<String>> removeFavourite(
            @PathVariable Long userId,
            @PathVariable Long movieId) {
        favouriteService.removeFavourite(userId, movieId);
        ApiResponse<String> response = new ApiResponse<>(
                HttpStatus.OK.value(),
                "Movie removed from favourites successfully"
        );
        return ResponseEntity.ok(response);
    }
}
